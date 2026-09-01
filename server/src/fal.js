import { env } from './env.js'
import { ApiError } from './middleware/errors.js'

const BASE = 'https://fal.run'

/**
 * The one place that talks to fal.
 *
 * Synchronous endpoint rather than the queue: a slide takes seven to nine
 * seconds, which is inside any sane request timeout, and polling a queue would
 * mean a second round of state to persist and reconcile for no gain at this
 * size. If slide counts ever grow past what one request can hold, this is the
 * seam to move to fal's queue API behind.
 */
async function call(model, input, { timeoutMs = 90_000 } = {}) {
  if (!env.fal.configured) {
    throw new ApiError(503, 'generation_not_configured', 'Image generation is not set up on this server yet.')
  }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)

  let res
  try {
    res = await fetch(`${BASE}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${env.fal.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: abort.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(504, 'generation_timeout', 'The image generator took too long. Nothing was charged twice.')
    }
    throw new ApiError(502, 'generation_unreachable', 'Could not reach the image generator.')
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (!res.ok) {
    // fal echoes the model id and sometimes the org id; neither is secret, but
    // the raw payload is not something to hand a customer either. Map the two
    // cases that actually matter and keep the rest generic.
    if (res.status === 401 || res.status === 403) {
      if (isOutOfCredit(data)) {
        throw new ApiError(
          503,
          'generation_out_of_credit',
          'Image generation is paused because our generation account is out of credit. This is on us — it is not your plan or your card.'
        )
      }
      throw new ApiError(502, 'generation_auth_failed', 'The image generator rejected our credentials.')
    }
    if (res.status === 402 || res.status === 429) {
      throw new ApiError(
        503,
        'generation_unavailable',
        'Image generation is temporarily unavailable. You have not been charged.'
      )
    }
    // The content checker is the one failure a caller can actually act on, and
    // it fires on innocuous wording — "gentle laugh lines" was enough to block
    // a portrait of a friendly grandmother. Saying so lets someone reword the
    // topic instead of retrying an identical request that cannot succeed.
    if (isContentPolicy(data)) {
      throw new ApiError(
        422,
        'content_rejected',
        'The image generator refused that wording. Try describing the carousel differently.'
      )
    }
    throw new ApiError(502, 'generation_failed', `The image generator returned ${res.status}.`)
  }

  return data
}


/**
 * fal answers 403 both for a bad key and for an account that has run out of
 * credit — the latter as {"detail":"User is locked. Reason: TOP_UP."}. Mapping
 * both to "rejected our credentials" sent a real outage off to look at the key,
 * which was fine; the balance was not.
 */
function isOutOfCredit(data) {
  const detail = typeof data?.detail === 'string' ? data.detail : ''
  return /locked/i.test(detail) || /top_?up/i.test(detail)
}

/**
 * fal reports a blocked prompt as a 422 whose `detail` is an array of
 * per-field errors, so the type is nested rather than at the top level.
 */
function isContentPolicy(data) {
  const detail = data?.detail
  if (Array.isArray(detail)) return detail.some((d) => d?.type === 'content_policy_violation')
  return detail?.type === 'content_policy_violation'
}

/** One image. Returns its temporary fal URL — copy it into our own storage. */
async function image(model, input) {
  const data = await call(model, input)
  const url = data?.images?.[0]?.url
  if (!url) throw new ApiError(502, 'generation_empty', 'The image generator returned no image.')
  return url
}

/**
 * The carousel ratio. Multiframe passes 9:16 instead — a reel frame is the
 * first frame of a video, and generating it at 4:5 and letting the video model
 * letterbox it wastes most of the shot.
 */
const DEFAULT_ASPECT = '4:5'

/**
 * Slide 1: invents the character and fixes the look every later slide inherits.
 */
export function generateFirstSlide(prompt, { aspectRatio = DEFAULT_ASPECT } = {}) {
  return image(env.fal.imageModel, { prompt, aspect_ratio: aspectRatio, num_images: 1 })
}

/**
 * Slides 2..n: the same character, doing something else.
 *
 * Conditioned on slide 1 rather than on the previous slide. Chaining each slide
 * off the one before it compounds drift — by slide five the character has
 * quietly become someone else — and it also serialises the whole batch. Every
 * slide referencing slide 1 keeps them identical and lets them run at once.
 */
export function generateSlideFrom(reference, prompt, { aspectRatio = DEFAULT_ASPECT } = {}) {
  // One reference or several. Multiframe passes two — the frame that fixes the
  // person and the photo of the product the ad is about — because the edit
  // model takes a list and holding both identities at once is the whole job.
  const image_urls = Array.isArray(reference) ? reference.filter(Boolean) : [reference]
  return image(env.fal.editModel, {
    prompt,
    image_urls,
    aspect_ratio: aspectRatio,
    num_images: 1,
  })
}

/**
 * Build a still that contains a real object the customer gave us.
 *
 * The edit model rather than the text-to-image one, with the product photo as
 * the only reference. Describing a product in words and hoping the generator
 * invents the same one is how you get an ad for a candle that is not the
 * customer's candle — the shape, the label and the colour all drift. Handing it
 * the actual photograph is the only thing that holds them.
 */
export function generateSceneWithProduct(productUrl, prompt, { aspectRatio = DEFAULT_ASPECT } = {}) {
  return image(env.fal.editModel, {
    prompt,
    image_urls: [productUrl],
    aspect_ratio: aspectRatio,
    num_images: 1,
  })
}

/**
 * Ask the text model to look at an image and say what it is.
 *
 * Used once per reel, to tell the director what it is writing an ad about. The
 * idea someone types is often just "a reel for my candle", which is not enough
 * for a model to place the thing in a room convincingly — it needs the colour,
 * the material, the size in the hand.
 *
 * Deliberately best-effort. any-llm only accepts an image for models that can
 * see, and the configured text model can change under us in env. A reel is
 * worth more than a perfect description, so a failure here returns null and the
 * caller carries on with the words it already had.
 */
export async function describeImage(imageUrl, question) {
  try {
    const data = await call(
      'fal-ai/any-llm',
      { model: env.fal.textModel, prompt: question, image_url: imageUrl },
      { timeoutMs: 30_000 }
    )
    const out = String(data?.output || '').trim()
    return out ? out.slice(0, 600) : null
  } catch (err) {
    console.warn('[fal] product description unavailable:', err?.message || err)
    return null
  }
}

/** Slide copy. Returns raw model text; the caller parses it. */
export async function complete(prompt) {
  const data = await call('fal-ai/any-llm', { model: env.fal.textModel, prompt }, { timeoutMs: 45_000 })
  if (data?.error) throw new ApiError(502, 'copy_failed', 'Could not write the carousel copy.')
  return String(data?.output || '')
}

/** Pull a finished image off fal's temporary URL so we can archive it. */
export async function download(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new ApiError(502, 'generation_download_failed', `Could not download the finished image (${res.status}).`)
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'image/png',
  }
}

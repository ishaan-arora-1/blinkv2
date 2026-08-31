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
export function generateSlideFrom(referenceUrl, prompt, { aspectRatio = DEFAULT_ASPECT } = {}) {
  return image(env.fal.editModel, {
    prompt,
    image_urls: [referenceUrl],
    aspect_ratio: aspectRatio,
    num_images: 1,
  })
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

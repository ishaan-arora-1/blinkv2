import { env } from './env.js'
import { badRequest, ApiError } from './middleware/errors.js'

/**
 * Blink AI video generation, on fal.
 *
 * This replaced Google Veo. Two reasons, in order of how much they cost:
 *
 *  1. Veo billed against a Google AI balance that ran dry, and when it did,
 *     every Growth subscriber's generation failed. Images and slide copy had
 *     already moved to fal, so keeping video on a second vendor meant two
 *     balances to keep funded and two ways for the product to go dark.
 *  2. Veo is priced per second of output well above what this feature needs.
 *
 * The exported shape is unchanged from the Veo module on purpose — the route,
 * the blinks table and the browser's polling all still work the same way, and
 * a swap of the engine underneath should not be a rewrite of everything above.
 *
 * The queue API rather than the synchronous one: a clip takes 40-60 seconds,
 * which no proxy will hold open.
 */

const QUEUE = 'https://queue.fal.run'

// What Wan 2.2 actually does. This is the honest list, not the aspirational
// one: the model tops out at 720p, so offering 1080p would be advertising a
// resolution the generator cannot produce.
export const LIMITS = {
  duration: { min: 4, max: 8, default: 5 },
  aspectRatios: ['9:16', '16:9'],
  resolutions: ['480p', '720p'],
}

// Wan counts frames, not seconds. 16 fps is the model's native rate; the extra
// frame is because a clip of n seconds spans n*fps + 1 frames inclusive.
const FPS = 16
const framesFor = (seconds) => Math.round(seconds * FPS) + 1

/**
 * The creator roster, mirrored from the web app's src/lib/creators.js.
 *
 * The client sends a creator *id*, never a URL. If it sent a URL the server
 * would happily hand it to fal, which is a server-side request forgery hole —
 * an attacker could point it at an internal address. The allowlist closes that,
 * and it still matters on fal even though fal fetches the URL rather than us.
 */
const CREATOR_IMAGES = {
  cr_tech_guy: '/creators/tech-guy.jpg',
  cr_tech_girl: '/creators/tech-girl.jpg',
  cr_gym_guy: '/creators/gym-guy.jpg',
  cr_gym_girl: '/creators/gym-girl.jpg',
  cr_casual_guy: '/creators/casual-guy.jpg',
  cr_casual_girl: '/creators/casual-girl.jpg',
  cr_older_woman: '/creators/older-woman.jpg',
  cr_older_man: '/creators/older-man.jpg',
  cr_business_woman: '/creators/business-woman.jpg',
  cr_dad_guy: '/creators/dad-guy.jpg',
}

const MAX_PRODUCT_BYTES = 8 * 1024 * 1024

/**
 * The product photo arrives base64 from the browser and goes to fal as a data
 * URL. Veo wanted the bytes split from the mime type; fal wants the whole data
 * URL, so this returns the string it was given once it has been checked.
 */
export function decodeProductImage(dataUrl) {
  if (!dataUrl) return null
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) throw badRequest('Product image must be a base64 image data URL.')

  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_PRODUCT_BYTES) {
    throw badRequest(`Product image is ${(bytes.length / 1e6).toFixed(1)} MB — keep it under 8 MB.`)
  }
  return dataUrl
}

/**
 * The creator still, fetched here and handed over as a data URL.
 *
 * Passing fal the public URL would be less work, and it is tempting because
 * these are public assets — but it makes the generator's ability to reach the
 * web app a hidden requirement of the feature. In local development WEB_ORIGIN
 * is http://localhost:5199, which fal's servers cannot resolve, so every
 * creator-anchored generation failed with a 422 that said nothing about why.
 *
 * Fetching here keeps the round trip inside our own network, works in any
 * environment, and costs a couple of hundred kilobytes on a request that is
 * about to spend a lot more than that rendering video.
 */
export async function fetchCreatorImage(creatorId) {
  if (!creatorId) return null
  const path = CREATOR_IMAGES[creatorId]
  if (!path) throw badRequest(`Unknown creator "${creatorId}".`)

  const res = await fetch(`${env.webOrigin}${path}`)
  if (!res.ok) {
    throw new ApiError(502, 'creator_image_unavailable', `Could not load the creator still (${res.status}).`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function validateOptions(opts = {}) {
  const duration = Math.round(Number(opts.durationSeconds ?? LIMITS.duration.default))
  if (!Number.isFinite(duration) || duration < LIMITS.duration.min || duration > LIMITS.duration.max) {
    throw badRequest(`Duration must be between ${LIMITS.duration.min} and ${LIMITS.duration.max} seconds.`)
  }
  const aspectRatio = opts.aspectRatio || '9:16'
  if (!LIMITS.aspectRatios.includes(aspectRatio)) throw badRequest('Unsupported aspect ratio.')

  // An older client still asks for 1080p, which this model cannot do. Clamping
  // beats rejecting: the request is otherwise fine and the person gets a video.
  const asked = opts.resolution || '720p'
  const resolution = LIMITS.resolutions.includes(asked) ? asked : '720p'

  const negativePrompt = String(opts.negativePrompt || '').trim().slice(0, 500)
  return { duration, aspectRatio, resolution, negativePrompt }
}

async function callQueue(path, { method = 'GET', body } = {}) {
  if (!env.fal.configured) {
    throw new ApiError(503, 'generation_not_configured', 'Video generation is not set up on this server yet.')
  }

  const res = await fetch(path.startsWith('http') ? path : `${QUEUE}/${path}`, {
    method,
    headers: {
      Authorization: `Key ${env.fal.key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (!res.ok) {
    // Logged, never returned: fal's detail is the only thing that explains a
    // rejection, and without it a failed render is a status code and a shrug.
    // It can name the offending field and echo the input, so it stays in the
    // logs rather than going to a customer.
    console.warn(`[video] ${res.status} from ${path.split('?')[0]} — ${text.slice(0, 300)}`)

    if (res.status === 401 || res.status === 403) {
      throw new ApiError(502, 'generation_auth_failed', 'The video generator rejected our credentials.')
    }
    if (res.status === 402 || res.status === 429) {
      throw new ApiError(
        503,
        'generation_unavailable',
        'Video generation is temporarily unavailable. You have not been charged.'
      )
    }
    if (isContentPolicy(data)) {
      throw new ApiError(
        422,
        'content_rejected',
        'The video generator refused that description. Try wording it differently.'
      )
    }
    throw new ApiError(502, 'generation_failed', `The video generator returned ${res.status}.`)
  }
  return data
}

function isContentPolicy(data) {
  const d = data?.detail
  if (Array.isArray(d)) return d.some((x) => x?.type === 'content_policy_violation')
  return d?.type === 'content_policy_violation'
}

/**
 * Kick off a generation. Returns the status URL to poll.
 *
 * fal's status URL collapses the model's sub-path — a request against
 * `fal-ai/wan/v2.2-a14b/image-to-video` is polled at `fal-ai/wan/requests/...`
 * — so the URL it hands back is stored and reused rather than rebuilt from the
 * model name, which would 404.
 */
export async function startGeneration({ prompt, creatorImage, productImage, options }) {
  const notes = [
    creatorImage && 'Keep the person from the starting image exactly as they are: same face, same outfit, same room.',
    productImage && !creatorImage && 'Feature the product from the starting image prominently.',
    productImage && creatorImage && 'The creator is holding and showing their product to the camera.',
  ]
    .filter(Boolean)
    .join(' ')

  // One driving image. Veo could take a second as a reference asset; Wan takes
  // only the one, so when both are supplied the creator drives the shot and the
  // product is described in words. Worth knowing before wondering why a product
  // photo did not survive into the frame.
  const image = creatorImage || productImage

  const model = image ? env.fal.videoImageModel : env.fal.videoModel
  const input = {
    prompt: notes ? `${prompt}\n\n${notes}` : prompt,
    resolution: options.resolution,
    num_frames: framesFor(options.duration),
    ...(image ? { image_url: image } : { aspect_ratio: options.aspectRatio }),
    ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
  }

  const data = await callQueue(model, { method: 'POST', body: input })
  if (!data.status_url) {
    throw new ApiError(502, 'generation_no_operation', 'The generator accepted the request but returned nothing to poll.')
  }
  return { operationName: data.status_url, videoUri: null }
}

/** One poll. `operationName` is the status URL handed back at submit time. */
export async function pollOperation(operationName) {
  const st = await callQueue(operationName)

  if (st.status === 'FAILED') {
    throw new ApiError(502, 'generation_failed', 'The video could not be generated. You have not been charged twice.')
  }
  if (st.status !== 'COMPLETED') return { done: false, videoUri: null }

  // The result lives at the status URL without the /status suffix.
  const result = await callQueue(operationName.replace(/\/status$/, ''))
  const uri = extractVideoUri(result)
  if (!uri) throw new ApiError(502, 'generation_empty', 'The generator finished, but no video came back.')
  return { done: true, videoUri: uri }
}

/** Pull the finished clip so it can be archived in our own storage. */
export async function downloadVideo(videoUri) {
  const res = await fetch(videoUri)
  if (!res.ok) {
    throw new ApiError(502, 'generation_download_failed', `Could not download the finished video (${res.status}).`)
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'video/mp4',
  }
}

function extractVideoUri(r) {
  return r?.video?.url || r?.videos?.[0]?.url || r?.output?.video?.url || null
}

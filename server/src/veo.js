import { env } from './env.js'
import { badRequest, ApiError } from './middleware/errors.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

// What veo-3.1-generate-preview actually accepts on this API. generateAudio and
// personGeneration are rejected outright, which is why they are absent.
export const LIMITS = {
  duration: { min: 4, max: 8, default: 6 },
  aspectRatios: ['9:16', '16:9'],
  resolutions: ['720p', '1080p'],
}

// The creator roster, mirrored from the web app's src/lib/creators.js.
//
// The client sends a creator *id*, never a URL. If it sent a URL the server
// would happily fetch it, which is a server-side request forgery hole — an
// attacker could point this at an internal address and read the response back
// out through the error message. The allowlist closes that.
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

/** Turn a data: URL from the browser into the shape Veo wants. */
export function decodeProductImage(dataUrl) {
  if (!dataUrl) return null
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) throw badRequest('Product image must be a base64 image data URL.')

  const [, mimeType, b64] = m
  const bytes = Buffer.from(b64, 'base64')
  if (bytes.length > MAX_PRODUCT_BYTES) {
    throw badRequest(`Product image is ${(bytes.length / 1e6).toFixed(1)} MB — keep it under 8 MB.`)
  }
  return { bytesBase64Encoded: b64, mimeType }
}

export async function fetchCreatorImage(creatorId) {
  if (!creatorId) return null
  const path = CREATOR_IMAGES[creatorId]
  if (!path) throw badRequest(`Unknown creator "${creatorId}".`)

  const url = `${env.webOrigin}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new ApiError(502, 'creator_image_unavailable', `Could not load the creator still (${res.status}).`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    bytesBase64Encoded: buf.toString('base64'),
    mimeType: res.headers.get('content-type') || 'image/jpeg',
  }
}

export function validateOptions(opts = {}) {
  const duration = Math.round(Number(opts.durationSeconds ?? LIMITS.duration.default))
  if (!Number.isFinite(duration) || duration < LIMITS.duration.min || duration > LIMITS.duration.max) {
    throw badRequest(`Duration must be between ${LIMITS.duration.min} and ${LIMITS.duration.max} seconds.`)
  }
  const aspectRatio = opts.aspectRatio || '9:16'
  if (!LIMITS.aspectRatios.includes(aspectRatio)) throw badRequest('Unsupported aspect ratio.')

  const resolution = opts.resolution || '1080p'
  if (!LIMITS.resolutions.includes(resolution)) throw badRequest('Unsupported resolution.')

  const negativePrompt = String(opts.negativePrompt || '').trim().slice(0, 500)
  return { duration, aspectRatio, resolution, negativePrompt }
}

/**
 * Kick off a generation. Returns the long-running operation name to poll.
 */
export async function startGeneration({ prompt, creatorImage, productImage, options }) {
  const notes = [
    creatorImage && 'Keep the person from the starting image as the creator on camera, same face and outfit.',
    productImage && !creatorImage && 'Feature the product from the starting image prominently.',
    productImage && creatorImage && 'The creator is holding and showing their product to the camera.',
  ]
    .filter(Boolean)
    .join(' ')

  const instance = { prompt: notes ? `${prompt}\n\n${notes}` : prompt }
  const startImage = creatorImage || productImage
  if (startImage) instance.image = startImage
  // Veo takes one starting image; when both are supplied the other rides along
  // as a reference asset.
  if (creatorImage && productImage) {
    instance.referenceImages = [{ image: productImage, referenceType: 'asset' }]
  }

  const res = await fetch(
    `${BASE}/models/${env.google.model}:predictLongRunning?key=${env.google.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: options.aspectRatio,
          resolution: options.resolution,
          durationSeconds: options.duration,
          ...(options.negativePrompt ? { negativePrompt: options.negativePrompt } : {}),
        },
      }),
    }
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(502, 'veo_rejected', scrub(data?.error?.message) || `Veo returned ${res.status}`)
  }
  if (!data.name) {
    // Some responses come back inline rather than as an operation.
    const inline = extractVideoUri(data)
    if (inline) return { operationName: null, videoUri: inline }
    throw new ApiError(502, 'veo_no_operation', 'Veo accepted the request but returned nothing to poll.')
  }
  return { operationName: data.name, videoUri: null }
}

/** One poll of a long-running operation. */
export async function pollOperation(operationName) {
  const res = await fetch(`${BASE}/${operationName}?key=${env.google.apiKey}`)
  const op = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(502, 'veo_poll_failed', scrub(op?.error?.message) || `Veo returned ${res.status}`)
  }
  if (op.error) {
    throw new ApiError(502, 'veo_failed', scrub(op.error.message) || 'Generation failed.')
  }
  if (!op.done) return { done: false, videoUri: null }

  const uri = extractVideoUri(op)
  if (!uri) throw new ApiError(502, 'veo_empty', 'Veo finished, but no video came back.')
  return { done: true, videoUri: uri }
}

/** Pull the finished mp4. The API key is appended here and never leaves. */
export async function downloadVideo(videoUri) {
  const url = `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${env.google.apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new ApiError(502, 'veo_download_failed', `Could not download the finished video (${res.status}).`)
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'video/mp4',
  }
}

function extractVideoUri(op) {
  const r = op?.response || op
  return (
    r?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    r?.generatedVideos?.[0]?.video?.uri ||
    r?.generatedSamples?.[0]?.video?.uri ||
    r?.videos?.[0]?.uri ||
    null
  )
}

// Google echoes the request URL in some error messages, which contains the API
// key. Never let that reach a client.
function scrub(msg) {
  if (!msg) return msg
  return String(msg).split(env.google.apiKey).join('[redacted]')
}

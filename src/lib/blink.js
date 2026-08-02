// Blink AI — one Google Veo call for prompt-driven video generation.
//   VITE_GOOGLE_AI_KEY=...    (required)
//   VITE_GOOGLE_AI_MODEL=...  (defaults to veo-3.1-generate-preview)

const KEY = import.meta.env.VITE_GOOGLE_AI_KEY || ''
const MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL || 'veo-3.1-generate-preview'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const hasKey = () => Boolean(KEY)

function toBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function fileToImage(file) {
  return { bytesBase64Encoded: toBase64(await file.arrayBuffer()), mimeType: file.type || 'image/jpeg' }
}

async function urlToImage(url) {
  const blob = await (await fetch(url)).blob()
  return { bytesBase64Encoded: toBase64(await blob.arrayBuffer()), mimeType: blob.type || 'image/jpeg' }
}

function extractVideo(op) {
  const r = op?.response || op
  const uri =
    r?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    r?.generatedVideos?.[0]?.video?.uri ||
    r?.generatedSamples?.[0]?.video?.uri ||
    r?.videos?.[0]?.uri
  if (!uri) return null
  return { kind: 'video', url: `${uri}${uri.includes('?') ? '&' : '?'}key=${KEY}` }
}

async function pollOperation(name, onStatus) {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 6000))
    const op = await (await fetch(`${BASE}/${name}?key=${KEY}`)).json()
    if (op.error) throw new Error(op.error.message || 'Generation failed')
    if (op.done) {
      const v = extractVideo(op)
      if (!v) throw new Error('Finished, but no video came back.')
      return v
    }
    onStatus?.(`Rendering your video… ${(i + 1) * 6}s`)
  }
  throw new Error('Timed out waiting for the video')
}

// What Veo 3.1 actually accepts (probed against the API)
export const LIMITS = {
  duration: { min: 4, max: 8, default: 6 },
  aspectRatios: ['9:16', '16:9'],
  resolutions: ['720p', '1080p'],
}

/**
 * @param {string} prompt   what the user typed (required)
 * @param {File?}  product  optional product photo
 * @param {object?} creator optional creator from the roster
 * @param {object} opts     { durationSeconds, aspectRatio, resolution, generateAudio, negativePrompt }
 */
export async function generate(prompt, product, creator, onStatus, opts = {}) {
  if (!KEY) throw new Error('No Google AI key configured — add VITE_GOOGLE_AI_KEY to reelmint/.env and restart the dev server.')

  // Veo takes one starting image; extra context goes in the prompt.
  const creatorImg = creator ? await urlToImage(creator.img) : null
  const productImg = product ? await fileToImage(product) : null

  const notes = [
    creator && 'Keep the person from the starting image as the creator on camera, same face and outfit.',
    product && !creator && 'Feature the product from the starting image prominently.',
    product && creator && 'The creator is holding and showing their product to the camera.',
  ].filter(Boolean).join(' ')

  const instance = { prompt: notes ? `${prompt}\n\n${notes}` : prompt }
  const startImage = creatorImg || productImg
  if (startImage) instance.image = startImage
  // when both are supplied, the second goes in as a reference
  if (creatorImg && productImg) instance.referenceImages = [{ image: productImg, referenceType: 'asset' }]

  onStatus?.('Sending to Veo…')
  const res = await fetch(`${BASE}/models/${MODEL}:predictLongRunning?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [instance],
      // Only these four are accepted by veo-3.1-generate-preview on this API —
      // generateAudio and personGeneration are rejected outright.
      parameters: {
        aspectRatio: opts.aspectRatio || '9:16',
        resolution: opts.resolution || '1080p',
        durationSeconds: opts.durationSeconds ?? LIMITS.duration.default,
        ...(opts.negativePrompt?.trim() ? { negativePrompt: opts.negativePrompt.trim() } : {}),
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Veo returned ${res.status}`)

  if (data.name) {
    onStatus?.('Rendering your video…')
    return pollOperation(data.name, onStatus)
  }
  const v = extractVideo(data)
  if (!v) throw new Error('No video came back from Veo.')
  return v
}

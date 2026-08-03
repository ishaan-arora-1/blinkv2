import { api } from './api.js'

// Mirrors the server's veo.js. Kept here so the form can render its controls
// without a round trip; the server re-validates everything regardless.
export const LIMITS = {
  duration: { min: 4, max: 8, default: 6 },
  aspectRatios: ['9:16', '16:9'],
  resolutions: ['720p', '1080p'],
}

const POLL_INTERVAL_MS = 6000
const POLL_TIMEOUT_MS = 15 * 60 * 1000

/** Read a File into the data URL the API expects. */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Start a generation. Returns the blink id to poll.
 *
 * The Google API key is not here and never was — this posts to our own server,
 * which checks the plan, meters the call, and owns the key.
 */
export async function startGeneration({ prompt, productFile, creator, options }) {
  const productImage = productFile ? await fileToDataURL(productFile) : null

  const res = await api('/api/veo/generate', {
    method: 'POST',
    body: {
      prompt,
      creatorId: creator?.id || null,
      creatorName: creator?.name || null,
      productImage,
      durationSeconds: options.durationSeconds,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      negativePrompt: options.negativePrompt || '',
    },
  })
  return res
}

export function checkStatus(blinkId, { signal } = {}) {
  return api(`/api/veo/status/${blinkId}`, { signal })
}

/**
 * Poll until the render finishes.
 *
 * Resolves with { status, url } or throws. Aborting the signal stops the poll
 * without failing the generation — the render continues server-side and can be
 * picked up again from the library.
 */
export async function awaitGeneration(blinkId, { onStatus, signal } = {}) {
  const startedAt = Date.now()

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    if (elapsed * 1000 > POLL_TIMEOUT_MS) {
      throw new Error('This is taking unusually long. Check your library in a few minutes.')
    }

    const res = await checkStatus(blinkId, { signal })
    if (res.status === 'ready') return res
    if (res.status === 'failed') throw new Error(res.error || 'Generation failed.')

    onStatus?.(elapsed === 0 ? 'Rendering your video…' : `Rendering your video… ${elapsed}s`)
    await sleep(POLL_INTERVAL_MS, signal)
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

import { api } from './api.js'

// Mirrors the server's video.js. Kept here so the form can render its controls
// without a round trip; the server re-validates everything regardless.
//
// Duration is a list, not a range: Veo 3.1 takes 4, 6 or 8 seconds and nothing
// in between.
export const LIMITS = {
  duration: { options: [4, 6, 8], default: 8 },
  aspectRatios: ['9:16', '16:9'],
  resolutions: ['720p', '1080p'],
  audio: true,
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
 * How many of the month's included generations are left.
 *
 * { used, limit, remaining, resetsAt }. The server enforces this regardless;
 * reading it here is only so the form can say so before someone writes a prompt
 * they cannot run.
 */
export function fetchUsage({ signal } = {}) {
  return api('/api/veo/usage', { signal })
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

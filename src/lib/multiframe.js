import { api } from './api.js'
import { fileToDataURL } from './blink.js'

// Mirrors server/src/multiframe.js so the form can render its controls without
// a round trip. The server re-validates everything regardless.
export const SCENE_COUNT = { min: 2, max: 6, default: 4 }
export const MAX_IDEA = 600

// Clip durations Veo accepts, same enum Blink AI offers.
export const DURATIONS = [4, 6, 8]

const POLL_INTERVAL_MS = 6000
// A reel is several clips rendering at once, so it is slower than a single
// Blink generation but not N times slower. Twenty minutes is well past the
// worst observed and still short enough to give up rather than poll forever.
const POLL_TIMEOUT_MS = 20 * 60 * 1000

export function fetchOptions({ signal } = {}) {
  return api('/api/multiframe/options', { signal })
}

/** { used, limit, remaining, resetsAt } — the shared Blink allowance. */
export function fetchUsage({ signal } = {}) {
  return api('/api/multiframe/usage', { signal })
}

/**
 * Start a reel. Returns { multiframeId, status } as soon as the row exists —
 * the planning and rendering happen behind it.
 */
export async function startReel({ idea, sceneCount, brandId, productFile, options }) {
  // Sent as a base64 data URL, the same shape Blink AI uses for its product
  // photo, so both features are validated by one function on the server.
  const productImage = productFile ? await fileToDataURL(productFile) : null

  return api('/api/multiframe/generate', {
    method: 'POST',
    body: {
      idea,
      sceneCount,
      brandId: brandId || null,
      productImage,
      durationSeconds: options.durationSeconds,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
    },
  })
}

export function checkStatus(id, { signal } = {}) {
  return api(`/api/multiframe/status/${id}`, { signal })
}

/**
 * Poll until every scene has settled.
 *
 * `onUpdate` receives each status payload, so the page can show frames and
 * finished clips arriving rather than one spinner for the whole reel — the
 * frames land about a minute before the first clip does, and they are the first
 * sign the split understood the idea.
 *
 * Aborting stops the poll without stopping the render: the clips continue at
 * fal and the reel can be picked up again from its row.
 */
export async function awaitReel(id, { onUpdate, signal } = {}) {
  const startedAt = Date.now()

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('This is taking unusually long. Your reel keeps rendering — check back in a few minutes.')
    }

    const res = await checkStatus(id, { signal })
    onUpdate?.(res)

    if (res.status === 'ready') return res
    if (res.status === 'failed') throw new Error(res.error || 'The reel could not be rendered.')

    await sleep(POLL_INTERVAL_MS, signal)
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

/** How the page labels a scene's half-finished state. */
export const SCENE_LABEL = {
  pending: 'Queued',
  framing: 'Drawing the frame…',
  frame_ready: 'Frame ready',
  rendering: 'Filming…',
  ready: 'Done',
  failed: 'Failed',
}

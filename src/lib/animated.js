import { api } from './api.js'

/**
 * Animated carousels.
 *
 * The server does the work and owns the money; this is the browser's half.
 * Generation is asynchronous for the same reason Blink AI is — a five-slide
 * render is around thirty seconds, which is too long to hold a request open.
 */

export const POLL_MS = 3000
// A five-slide carousel is ~30s. Ten times that and something is wrong at the
// vendor, and a browser tab polling forever helps nobody.
const MAX_POLLS = 100

export function fetchAnimatedOptions() {
  return api('/api/animated/options')
}

export function startAnimated({ topic, slideCount, characterId, brandId }) {
  return api('/api/animated/generate', {
    method: 'POST',
    body: { topic, slideCount, characterId, brandId },
  })
}

export function animatedStatus(carouselId, { signal } = {}) {
  return api(`/api/animated/status/${carouselId}`, { signal })
}

/**
 * Poll until the carousel is finished.
 *
 * `onProgress` fires with { ready, total } so the caller can show real progress
 * rather than a spinner: slides land one at a time and watching four of five
 * arrive is a much better wait than a bar that could mean anything.
 */
export async function waitForAnimated(carouselId, { onProgress, signal } = {}) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const s = await animatedStatus(carouselId, { signal })
    onProgress?.(s)

    if (s.status === 'ready') return s
    if (s.status === 'failed') {
      throw new Error(s.error || 'The carousel could not be generated.')
    }
    await sleep(POLL_MS, signal)
  }
  throw new Error('This is taking much longer than usual. Check your library in a few minutes.')
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

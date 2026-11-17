import { api } from './api.js'
import { fileToDataURL } from './blink.js'

export const fetchActorOptions = () => api('/api/actors/options')
export const fetchActorUsage = () => api('/api/actors/usage')
export const listTakes = () => api('/api/actors').then((r) => r.videos || [])
export const getTake = (id, { signal } = {}) => api(`/api/actors/${id}`, { signal }).then((r) => r.video)
export const deleteTake = (id) => api(`/api/actors/${id}`, { method: 'DELETE' })

/**
 * Start a take. `productFile` and `faceFile` are File objects from inputs;
 * `productUrl` is an image URL handed over from Ad Ideas, fetched here so the
 * server receives the same data URL shape either way.
 */
export async function startTake({ actorId, script, voice, brandId, productFile, productUrl, faceFile, consent }) {
  let productImage = productFile ? await fileToDataURL(productFile) : null
  if (!productImage && productUrl) productImage = await urlToDataURL(productUrl).catch(() => null)
  const faceImage = faceFile ? await fileToDataURL(faceFile) : null

  return api('/api/actors/generate', {
    method: 'POST',
    body: { actorId, script, voice, brandId: brandId || null, productImage, faceImage, consent: Boolean(consent) },
  }).then((r) => r.video)
}

/**
 * Shop CDNs mostly allow cross-origin reads; when one does not, the take goes
 * ahead without the product in hand rather than failing.
 */
async function urlToDataURL(url) {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  // Re-encoded through a canvas so a PNG with transparency or an AVIF from a
  // CDN arrives as a JPEG the storage bucket accepts.
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export const TAKE_STATE = {
  voicing: 'Recording the voice…',
  composing: 'Putting your product in their hand…',
  rendering: 'Filming the take…',
  ready: 'Ready',
  failed: 'Failed',
}

export const isRendering = (s) => ['voicing', 'composing', 'rendering'].includes(s)

/** ~2.6 spoken words a second, matching the server's estimate. */
export function spokenSeconds(script) {
  const words = String(script || '').trim().split(/\s+/).filter(Boolean).length
  return words ? Math.max(3, Math.ceil(words / 2.6 + 0.5)) : 0
}

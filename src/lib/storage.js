import { supabase } from './supabase.js'

// Both buckets are private, so nothing is displayable without a signed URL.
export const UPLOADS = 'uploads'
export const GENERATIONS = 'generations'

const TTL_SECONDS = 60 * 60
// Re-sign a little before the real expiry so a long editing session never hits
// a dead URL mid-render.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

// bucket::path -> { url, expiresAt, promise }
const cache = new Map()

function key(bucket, path) {
  return `${bucket}::${path}`
}

/**
 * Resolve a storage path to a displayable URL.
 *
 * Concurrent callers for the same path share one in-flight request — the
 * carousel editor asks for the same background from several components at once,
 * and signing it five times is five round trips for one answer.
 */
export async function signedUrl(bucket, path) {
  if (!path || !supabase) return null

  const k = key(bucket, path)
  const hit = cache.get(k)
  if (hit) {
    if (hit.promise) return hit.promise
    if (hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url
  }

  const promise = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS)
    if (error || !data?.signedUrl) {
      cache.delete(k)
      console.warn(`[storage] could not sign ${k}:`, error?.message)
      return null
    }
    cache.set(k, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    return data.signedUrl
  })()

  cache.set(k, { promise, expiresAt: Date.now() + TTL_SECONDS * 1000 })
  return promise
}

/** Sign many paths at once, preserving order. */
export async function signedUrls(bucket, paths) {
  return Promise.all((paths || []).map((p) => signedUrl(bucket, p)))
}

export async function uploadFile(bucket, path, file, { upsert = false } = {}) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert,
    contentType: file.type || undefined,
    cacheControl: '3600',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function removeFile(bucket, path) {
  if (!path) return
  cache.delete(key(bucket, path))
  const { error } = await supabase.storage.from(bucket).remove([path])
  // A missing object is the state we wanted anyway.
  if (error && !/not found/i.test(error.message)) {
    console.warn(`[storage] could not remove ${path}:`, error.message)
  }
}

export function forgetSignedUrl(bucket, path) {
  cache.delete(key(bucket, path))
}

// ─── path conventions ───────────────────────────────────────────────────────
// The first segment is always the owner's uid — every storage policy in
// 0003_storage.sql keys on it, so a path that does not start with the user's id
// is rejected by the database, not just by us.

const ext = (file, fallback) => {
  const m = /\.([a-z0-9]+)$/i.exec(file?.name || '')
  return m ? m[1].toLowerCase() : fallback
}

const rand = () => Math.random().toString(36).slice(2, 10)

export const setImagePath = (userId, setId, file) =>
  `${userId}/sets/${setId}/${Date.now().toString(36)}_${rand()}.${ext(file, 'jpg')}`

export const demoPath = (userId, file) =>
  `${userId}/demos/${Date.now().toString(36)}_${rand()}.${ext(file, 'mp4')}`

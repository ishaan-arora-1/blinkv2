import { api } from './api.js'
import { fileToDataURL } from './blink.js'
import { UPLOADS, uploadFile } from './storage.js'
import { supabase } from './supabase.js'

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

/** { usedSeconds, limitSeconds, remainingSeconds, resetsAt } — this tier's video allowance. */
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
 * Film the reel — the step that actually spends the monthly allowance.
 *
 * Separate from starting one on purpose. The frames are cheap and arrive first,
 * and they are what tells you whether the scenes are worth filming, so nothing
 * is charged for video until this is called.
 */
export function startVideos(id) {
  return api(`/api/multiframe/${id}/videos`, { method: 'POST' })
}

/**
 * Redraw one frame. With an instruction it is an edit of the picture that is
 * there; without one it is a straight re-roll of that scene.
 */
export function redrawFrame(id, idx, instruction) {
  return api(`/api/multiframe/${id}/frames/${idx}`, {
    method: 'POST',
    body: { instruction: instruction || '' },
  })
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
export async function awaitReel(id, { onUpdate, signal, until = ['ready'] } = {}) {
  const startedAt = Date.now()
  const stopOn = new Set(until)

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('This is taking unusually long. Your reel keeps rendering — check back in a few minutes.')
    }

    const res = await checkStatus(id, { signal })
    onUpdate?.(res)

    if (stopOn.has(res.status)) return res
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
  framing: 'Drawing…',
  frame_ready: 'Frame ready',
  rendering: 'Filming…',
  ready: 'Filmed',
  failed: 'Failed',
}

// ── the finish: script, voice, timing, and the cuts ──────────────────────────

/** Save the script. Text only — it does not pay for a new reading. */
export function saveScript(id, script) {
  return api(`/api/multiframe/${id}/script`, { method: 'PATCH', body: { script } })
}

/** Read the script aloud. Returns { voiceoverUrl, durationSeconds, words }. */
export function generateVoiceover(id, { script, voice } = {}) {
  return api(`/api/multiframe/${id}/voiceover`, { method: 'POST', body: { script, voice } })
}

/**
 * How long each scene is held, and when the narration comes in. Costs nothing —
 * the clips are filmed and the voice is read, so this is only an edit.
 */
export function saveTiming(id, { voOffsetSeconds, trims } = {}) {
  return api(`/api/multiframe/${id}/timing`, { method: 'PATCH', body: { voOffsetSeconds, trims } })
}

/**
 * Store a finished cut.
 *
 * The bytes go straight from the browser to the uploads bucket, where this
 * user's own storage policy already lets them write under their own prefix. The
 * API is only told where it landed — pushing twenty megabytes through it to
 * re-upload them server-side would buy nothing but latency.
 */
export async function saveCut(id, { kind, blob, durationSeconds }) {
  const { data } = await supabase.auth.getUser()
  const userId = data?.user?.id
  if (!userId) throw new Error('You are signed out — sign in again to save this cut.')

  // Named for what it actually is. The recorder produces mp4 wherever the
  // browser can, and a file stored as .webm that is really mp4 downloads with
  // the wrong extension and gets rejected by everything it is uploaded to.
  const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm'
  const storagePath = `${userId}/multiframe/${id}/${kind}.${ext}`
  await uploadFile(UPLOADS, storagePath, new File([blob], `${kind}.${ext}`, { type: blob.type || 'video/webm' }), {
    upsert: true,
  })

  return api(`/api/multiframe/${id}/renders`, {
    method: 'POST',
    body: { kind, storagePath, durationSeconds },
  })
}

/** What a cut is called, in the order they are made. */
export const CUT_LABEL = {
  plain: 'Clips joined',
  voiceover: 'With voiceover',
  subtitled: 'With subtitles',
}

/**
 * Every reel on this account, newest first.
 *
 * Read straight from Supabase rather than through the API, the way the store
 * reads carousels and videos: row-level security already scopes it to the
 * owner, and the dropdown only needs what the row itself holds. Opening one
 * still goes through /status, which is what signs the frames and clips.
 */
export async function listReels({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('multiframes')
    .select('id, name, idea, status, scene_count, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    idea: r.idea,
    status: r.status,
    sceneCount: r.scene_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/** Delete a reel and everything under it. */
export async function deleteReel(id) {
  const { error } = await supabase.from('multiframes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Whether a reel is still doing something, for the dot in the list. */
export function isWorking(status) {
  return status === 'pending' || status === 'scripting' || status === 'rendering'
}

/** What a reel's state is called in the history list. */
export const REEL_STATE = {
  pending: 'starting',
  scripting: 'planning',
  frames_ready: 'frames ready',
  rendering: 'filming',
  ready: 'done',
  failed: 'failed',
}

/** Seconds, written the way the plans describe them. */
export function fmtSeconds(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}m ${r}s` : `${m} min`
}

/** A reel's name as a filename. */
export const slug = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'blink-ai'

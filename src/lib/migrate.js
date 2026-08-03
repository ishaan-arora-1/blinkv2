import { supabase } from './supabase.js'
import { UPLOADS, uploadFile, setImagePath, demoPath } from './storage.js'
import { newId } from './ids.js'
import { brandToRow, carouselToRow, videoToRow } from './mappers.js'

// Everything the app stored back when it was local-only, before accounts.
//
// These keys keep the old "reelmint-" prefix on purpose. They name data already
// sitting in people's browsers, so renaming them to match the Blink UGC brand
// would simply stop finding it — the import would silently offer nothing and the
// work it was meant to rescue would be stranded.
const LEGACY_STATE_KEY = 'reelmint-state-v1'
const LEGACY_DB = 'reelmint-blobs'
const LEGACY_STORE = 'blobs'

// One flag for the whole browser, NOT one per user.
//
// The localStorage blob is a property of this browser, not of any account.
// Keying the guard by user id meant every new account signed in here got a
// fresh flag and re-imported the same old carousels — which is exactly what
// happened, and why a brand-new account arrived with work already in it.
const CLAIM_KEY = 'reelmint-legacy-import'

// The first version of this keyed the flag per user (`reelmint-cloud-import:<uid>`),
// which is the bug that let a second account re-import the same data. Anyone who
// already ran that version has those keys; treat them as a claim so nobody is
// offered an import of work they demonstrably already have.
const OLD_CLAIM_PREFIX = 'reelmint-cloud-import:'

function adoptOldClaim() {
  if (localStorage.getItem(CLAIM_KEY)) return true
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(OLD_CLAIM_PREFIX)) {
      localStorage.setItem(CLAIM_KEY, 'claimed-by-earlier-version')
      return true
    }
  }
  return false
}

/**
 * What is sitting in this browser from the local-only era, if anything.
 * Read-only — it imports nothing, so the user can be asked first.
 */
export function detectLegacyData() {
  if (!supabase) return null
  if (adoptOldClaim()) return null

  const legacy = readLegacyState()
  if (!legacy) return null

  return {
    carousels: legacy.carousels?.length || 0,
    videos: legacy.videos?.length || 0,
    sets: legacy.customSets?.length || 0,
    blinks: legacy.blinks?.length || 0,
    appName: legacy.brand?.appName || null,
  }
}

/** The user said no. Never ask again on this browser. */
export function dismissLegacyData() {
  localStorage.setItem(CLAIM_KEY, `dismissed:${new Date().toISOString()}`)
}

/**
 * Lift work created in the local-only era into the signed-in account.
 *
 * Only ever called because the user asked for it.
 */
export async function runLegacyImport({ userId }) {
  if (!userId || !supabase) return null

  // Claim the work BEFORE doing any of it.
  //
  // localStorage reads and writes are synchronous, so this check-and-set cannot
  // be interleaved by another tab within a single JS turn. Setting the flag
  // afterwards instead let two tabs both pass the check and both import, which
  // is how every carousel ended up duplicated.
  if (adoptOldClaim()) return null
  localStorage.setItem(CLAIM_KEY, `importing:${new Date().toISOString()}`)

  const legacy = readLegacyState()
  if (!legacy) {
    localStorage.setItem(CLAIM_KEY, 'nothing-to-import')
    return null
  }

  const report = { count: 0, carousels: 0, videos: 0, sets: 0, images: 0, brand: false, skippedBlinks: 0, errors: [] }

  try {
    const blobs = await readLegacyBlobs()

    // ── brand ──
    if (legacy.brand?.appName || legacy.brand?.onboarded) {
      const { error } = await supabase
        .from('brands')
        .upsert({ user_id: userId, ...brandToRow(legacy.brand) })
      if (error) report.errors.push(`brand: ${error.message}`)
      else report.brand = true
    }

    // ── custom sets ──
    // Old images were IndexedDB keys. Remember where each one lands so the
    // carousels that reference the same key can be repointed below.
    const keyToPath = new Map()

    for (const set of legacy.customSets || []) {
      const setId = newId()
      const { error: setErr } = await supabase
        .from('image_sets')
        .insert({ id: setId, user_id: userId, name: set.name || 'Imported set' })
      if (setErr) {
        report.errors.push(`set "${set.name}": ${setErr.message}`)
        continue
      }
      report.sets++

      for (const [i, img] of (set.images || []).entries()) {
        const blob = img?.key ? blobs.get(img.key) : null
        if (!blob) continue
        try {
          const file = asFile(blob, `image-${i}.jpg`)
          const path = setImagePath(userId, setId, file)
          await uploadFile(UPLOADS, path, file)
          await supabase
            .from('set_images')
            .insert({ set_id: setId, user_id: userId, storage_path: path, position: i })
          keyToPath.set(img.key, path)
          report.images++
        } catch (err) {
          report.errors.push(`image in "${set.name}": ${err.message}`)
        }
      }
    }

    // ── carousels ──
    const carouselRows = (legacy.carousels || []).map((c) => {
      const slides = (c.slides || []).map((s) => ({ ...s, bg: repointBackground(s.bg, keyToPath) }))
      return carouselToRow({ ...c, id: newId(), slides }, userId)
    })
    if (carouselRows.length) {
      const { error } = await supabase.from('carousels').insert(carouselRows)
      if (error) report.errors.push(`carousels: ${error.message}`)
      else report.carousels = carouselRows.length
    }

    // ── videos ──
    for (const v of legacy.videos || []) {
      try {
        let path = null
        const blob = v.demoKey ? blobs.get(v.demoKey) : null
        if (blob) {
          const file = asFile(blob, 'demo.mp4')
          path = demoPath(userId, file)
          await uploadFile(UPLOADS, path, file)
        }
        const { error } = await supabase
          .from('videos')
          .insert(videoToRow({ ...v, id: newId(), demoPath: path }, userId))
        if (error) report.errors.push(`video "${v.name}": ${error.message}`)
        else report.videos++
      } catch (err) {
        report.errors.push(`video "${v.name}": ${err.message}`)
      }
    }

    // Blink AI generations are deliberately not imported. Their rows and their
    // storage objects are both server-written by design — that is what stops a
    // generation being fabricated client-side — so the browser cannot recreate
    // one. The old files stay in this browser's IndexedDB.
    report.skippedBlinks = (legacy.blinks || []).length

    report.count = report.carousels + report.videos + report.sets
    localStorage.setItem(CLAIM_KEY, `imported:${new Date().toISOString()}:${userId}`)
    return report
  } catch (err) {
    console.error('[migrate] legacy import failed', err)
    // Release the claim so the user can retry. Anything already written stays,
    // so a retry can duplicate — but a stuck claim would strand their work
    // permanently, which is worse, and they are the one deciding to retry.
    localStorage.removeItem(CLAIM_KEY)
    throw err
  }
}

function repointBackground(bg, keyToPath) {
  if (!bg) return bg
  // Built-in asset paths and gradient refs carry over untouched.
  if (typeof bg === 'string') return bg
  if (bg.key && keyToPath.has(bg.key)) return { path: keyToPath.get(bg.key) }
  // An upload we could not carry over — fall back to a gradient so the slide
  // still renders instead of showing a black rectangle.
  return 'gradient:0'
}

function asFile(blob, fallbackName) {
  if (blob instanceof File) return blob
  return new File([blob], fallbackName, { type: blob.type || 'application/octet-stream' })
}

function readLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const hasAnything =
      parsed?.brand?.appName ||
      parsed?.carousels?.length ||
      parsed?.videos?.length ||
      parsed?.customSets?.length
    return hasAnything ? parsed : null
  } catch {
    return null
  }
}

/** Read the whole legacy blob store in one pass. */
async function readLegacyBlobs() {
  const out = new Map()
  const db = await openLegacyDB()
  if (!db) return out

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LEGACY_STORE, 'readonly')
      const req = tx.objectStore(LEGACY_STORE).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        out.set(cursor.key, cursor.value)
        cursor.continue()
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[migrate] could not read legacy blobs', err)
  } finally {
    db.close()
  }
  return out
}

function openLegacyDB() {
  return new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null)
    // Do not create the database if it was never there.
    const req = indexedDB.open(LEGACY_DB)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.close()
        return resolve(null)
      }
      resolve(db)
    }
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

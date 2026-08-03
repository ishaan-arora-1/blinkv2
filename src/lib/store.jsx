import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from './auth.jsx'
import { builtinSets } from './library.js'
import { CREATORS } from './creators.js'
import { newId } from './ids.js'
import {
  UPLOADS,
  GENERATIONS,
  uploadFile,
  removeFile,
  setImagePath,
  demoPath,
} from './storage.js'
import {
  brandFromRow,
  brandToRow,
  carouselFromRow,
  carouselToRow,
  videoFromRow,
  videoToRow,
  blinkFromRow,
  setFromRow,
} from './mappers.js'
import { detectLegacyData, dismissLegacyData, runLegacyImport } from './migrate.js'

const StoreCtx = createContext(null)

const EMPTY = {
  brand: brandFromRow(null),
  customSets: [],
  carousels: [],
  videos: [],
  blinks: [],
}

// How long to sit on an edit before writing it. The carousel editor calls
// save() on every pointermove while a text layer is being dragged; against
// localStorage that was free, against Postgres it would be a write per frame.
const WRITE_DEBOUNCE_MS = 700

export function StoreProvider({ children }) {
  const { userId } = useAuth()
  const [state, setState] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [importNotice, setImportNotice] = useState(null)
  // Work found in this browser from before accounts existed. Offered, never
  // applied on its own — importing silently surprised people and, worse, made
  // brand new accounts look like they already had content in them.
  const [legacyFound, setLegacyFound] = useState(null)
  const [importing, setImporting] = useState(false)

  // ── deferred writes ───────────────────────────────────────────────────────
  // Keyed by table:id so repeated edits to one project collapse into a single
  // upsert carrying the latest state.
  const queue = useRef(new Map())
  const timer = useRef(null)
  const knownIds = useRef(new Set())

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!queue.current.size) return

    const batch = [...queue.current.values()]
    queue.current.clear()

    const byTable = new Map()
    for (const { table, row } of batch) {
      if (!byTable.has(table)) byTable.set(table, [])
      byTable.get(table).push(row)
    }

    setSyncing(true)
    try {
      await Promise.all(
        [...byTable.entries()].map(async ([table, rows]) => {
          const { error: err } = await supabase.from(table).upsert(rows)
          if (err) console.error(`[store] ${table} upsert failed:`, err.message)
        })
      )
    } finally {
      setSyncing(false)
    }
  }, [])

  const scheduleWrite = useCallback(
    (table, row, { immediate = false } = {}) => {
      queue.current.set(`${table}:${row.id}`, { table, row })
      if (immediate) return flush()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITE_DEBOUNCE_MS)
      return Promise.resolve()
    },
    [flush]
  )

  // A tab being hidden or closed is the common way to lose the last edit.
  // visibilitychange is the reliable one; beforeunload often fires too late for
  // an async request to leave the machine, but costs nothing to also try.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!userId || !supabase) return
    setStatus('loading')
    setError(null)

    try {
      const [brandRes, carouselsRes, videosRes, blinksRes, setsRes] = await Promise.all([
        supabase.from('brands').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('carousels').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('videos').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('blinks').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase
          .from('image_sets')
          .select('*, set_images(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])

      const firstError = [brandRes, carouselsRes, videosRes, blinksRes, setsRes].find((r) => r.error)?.error
      if (firstError) throw new Error(firstError.message)

      const next = {
        // The signup trigger creates the brand row, but a user who predates it
        // (or a failed trigger) should still get sensible defaults rather than
        // a crash on brand.appName.
        brand: brandFromRow(brandRes.data),
        carousels: (carouselsRes.data || []).map(carouselFromRow),
        videos: (videosRes.data || []).map(videoFromRow),
        blinks: (blinksRes.data || []).map(blinkFromRow),
        customSets: (setsRes.data || []).map(setFromRow),
      }

      knownIds.current = new Set([
        ...next.carousels.map((c) => c.id),
        ...next.videos.map((v) => v.id),
      ])

      setState(next)
      setStatus('ready')

      // Only look. The user decides whether any of it moves.
      setLegacyFound(detectLegacyData())
    } catch (err) {
      console.error('[store] load failed', err)
      setError(err)
      setStatus('error')
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setState(EMPTY)
      setStatus('idle')
      knownIds.current = new Set()
      return
    }
    load()
  }, [userId, load])

  // ── mutations ─────────────────────────────────────────────────────────────
  // Every one of these updates local state first so the UI never waits on the
  // network, then persists. The optimistic copy is what the editor renders.

  const api = useMemo(() => {
    const patchState = (fn) => setState((s) => ({ ...s, ...fn(s) }))

    const saveProject = (kind, table, toRow) => (proj) => {
      const isNew = !knownIds.current.has(proj.id)
      knownIds.current.add(proj.id)

      patchState((s) => {
        const list = s[kind]
        const i = list.findIndex((x) => x.id === proj.id)
        return { [kind]: i >= 0 ? list.map((x) => (x.id === proj.id ? proj : x)) : [proj, ...list] }
      })

      // A brand new project is written straight away — the wizard navigates to
      // its editor immediately, and a reload before the debounce elapsed would
      // land on a project that does not exist yet.
      return scheduleWrite(table, toRow(proj, userId), { immediate: isNew })
    }

    const deleteProject = (kind, table) => async (id) => {
      queue.current.delete(`${table}:${id}`)
      knownIds.current.delete(id)
      patchState((s) => ({ [kind]: s[kind].filter((x) => x.id !== id) }))
      const { error: err } = await supabase.from(table).delete().eq('id', id)
      if (err) console.error(`[store] ${table} delete failed:`, err.message)
    }

    return {
      state,
      status,
      error,
      syncing,
      reload: load,
      flush,

      importNotice,
      dismissImportNotice: () => setImportNotice(null),

      // ── legacy import (opt-in) ──
      legacyFound,
      importing,
      importLegacy: async () => {
        setImporting(true)
        try {
          const report = await runLegacyImport({ userId })
          setLegacyFound(null)
          if (report?.count) {
            setImportNotice(report)
            await load()
          }
          return report
        } finally {
          setImporting(false)
        }
      },
      dismissLegacy: () => {
        dismissLegacyData()
        setLegacyFound(null)
      },

      // ── brand ──
      // Typing in the brand form debounces like everything else. Finishing
      // onboarding passes immediate:true — it is the one brand write that gates
      // access to the rest of the app, and losing it to a closed tab would drop
      // the user back into the wizard with their answers gone.
      setBrand: (patch, { immediate = false } = {}) => {
        let merged
        setState((s) => {
          merged = { ...s.brand, ...patch }
          return { ...s, brand: merged }
        })
        // user_id is the primary key of brands, so upsert resolves to an update
        // for the row the signup trigger already created.
        return scheduleWrite('brands', { user_id: userId, ...brandToRow(merged) }, { immediate })
      },

      // ── sets ──
      allSets: () => [...builtinSets(), ...state.customSets],
      getSet: (id) => [...builtinSets(), ...state.customSets].find((x) => x.id === id),

      createSet: async (name) => {
        const set = { id: newId(), name: name?.trim() || 'My set', builtin: false, createdAt: Date.now(), images: [] }
        patchState((s) => ({ customSets: [set, ...s.customSets] }))
        const { error: err } = await supabase
          .from('image_sets')
          .insert({ id: set.id, user_id: userId, name: set.name })
        if (err) {
          patchState((s) => ({ customSets: s.customSets.filter((x) => x.id !== set.id) }))
          throw new Error(err.message)
        }
        return set
      },

      addImagesToSet: async (setId, files) => {
        const start = state.customSets.find((s) => s.id === setId)?.images.length ?? 0
        const added = []

        for (const [i, file] of files.entries()) {
          const path = setImagePath(userId, setId, file)
          await uploadFile(UPLOADS, path, file)
          const { data, error: err } = await supabase
            .from('set_images')
            .insert({ set_id: setId, user_id: userId, storage_path: path, position: start + i })
            .select('id, storage_path')
            .single()

          if (err) {
            // Do not leave an orphan object paying for storage forever.
            await removeFile(UPLOADS, path)
            throw new Error(err.message)
          }
          added.push({ id: data.id, path: data.storage_path })
        }

        patchState((s) => ({
          customSets: s.customSets.map((cs) =>
            cs.id === setId ? { ...cs, images: [...cs.images, ...added] } : cs
          ),
        }))
      },

      removeSetImage: async (setId, image) => {
        patchState((s) => ({
          customSets: s.customSets.map((cs) =>
            cs.id === setId ? { ...cs, images: cs.images.filter((im) => im.id !== image.id) } : cs
          ),
        }))
        await supabase.from('set_images').delete().eq('id', image.id)
        await removeFile(UPLOADS, image.path)
      },

      deleteSet: async (set) => {
        patchState((s) => ({ customSets: s.customSets.filter((x) => x.id !== set.id) }))
        // set_images rows cascade; the objects behind them do not.
        await supabase.from('image_sets').delete().eq('id', set.id)
        await Promise.all((set.images || []).map((im) => removeFile(UPLOADS, im.path)))
      },

      // ── characters ──
      allCharacters: () => CREATORS,
      getCharacter: (id) => CREATORS.find((c) => c.id === id),

      // ── carousels ──
      saveCarousel: saveProject('carousels', 'carousels', carouselToRow),
      deleteCarousel: deleteProject('carousels', 'carousels'),

      // ── videos ──
      saveVideo: saveProject('videos', 'videos', videoToRow),
      deleteVideo: async (id) => {
        const video = state.videos.find((v) => v.id === id)
        await deleteProject('videos', 'videos')(id)
        if (video?.demoPath) await removeFile(UPLOADS, video.demoPath)
      },

      uploadDemo: async (file) => {
        const path = demoPath(userId, file)
        await uploadFile(UPLOADS, path, file)
        return path
      },

      // ── blinks ──
      // Rows are created by the API server, never here — that is what keeps a
      // generation from being fabricated client-side. This only reflects them.
      upsertBlinkLocal: (blink) =>
        patchState((s) => {
          const i = s.blinks.findIndex((b) => b.id === blink.id)
          return { blinks: i >= 0 ? s.blinks.map((b) => (b.id === blink.id ? { ...b, ...blink } : b)) : [blink, ...s.blinks] }
        }),

      deleteBlink: async (id) => {
        const blink = state.blinks.find((b) => b.id === id)
        patchState((s) => ({ blinks: s.blinks.filter((b) => b.id !== id) }))
        await supabase.from('blinks').delete().eq('id', id)
        if (blink?.storagePath) await removeFile(GENERATIONS, blink.storagePath)
      },

      refreshBlinks: async () => {
        const { data } = await supabase
          .from('blinks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (data) patchState(() => ({ blinks: data.map(blinkFromRow) }))
      },
    }
  }, [state, status, error, syncing, importNotice, legacyFound, importing, userId, load, flush, scheduleWrite])

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { builtinSets } from './library.js'
import { CREATORS } from './creators.js'

const KEY = 'reelmint-state-v1'

const DEFAULT = {
  brand: {
    appName: '',
    tagline: '',
    category: 'productivity',
    verb: 'get things done',
    tone: 'bold',
    accent: '#d6f65c',
    onboarded: false,
  },
  customSets: [],      // {id, name, images:[{key (idb) }] } — images resolved to object URLs at runtime
  carousels: [],       // carousel projects
  customCharacters: [],
  customHooks: [],     // generated hooks {id, characterId, caption, emotion, duration}
  videos: [],          // video projects
  blinks: [],          // Blink AI generations {id, prompt, creatorName, blobKey|url, ...settings}
}

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
    } catch {}
    return DEFAULT
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { console.warn('persist failed', e) }
  }, [state])

  const api = useMemo(() => ({
    state,
    setState,
    update: (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })),
    setBrand: (brand) => setState((s) => ({ ...s, brand: { ...s.brand, ...brand } })),

    allSets: () => [...builtinSets(), ...state.customSets],
    getSet: (id) => [...builtinSets(), ...state.customSets].find((x) => x.id === id),

    allCharacters: () => CREATORS,
    getCharacter: (id) => CREATORS.find((c) => c.id === id),

    saveCarousel: (proj) => setState((s) => {
      const i = s.carousels.findIndex((c) => c.id === proj.id)
      const carousels = i >= 0 ? s.carousels.map((c) => (c.id === proj.id ? proj : c)) : [...s.carousels, proj]
      return { ...s, carousels }
    }),
    deleteCarousel: (id) => setState((s) => ({ ...s, carousels: s.carousels.filter((c) => c.id !== id) })),

    saveVideo: (proj) => setState((s) => {
      const i = s.videos.findIndex((c) => c.id === proj.id)
      const videos = i >= 0 ? s.videos.map((c) => (c.id === proj.id ? proj : c)) : [...s.videos, proj]
      return { ...s, videos }
    }),
    deleteVideo: (id) => setState((s) => ({ ...s, videos: s.videos.filter((c) => c.id !== id) })),

    // Blink AI keeps only metadata here — the mp4 itself lives in IndexedDB
    saveBlink: (entry) => setState((s) => ({ ...s, blinks: [...s.blinks, entry] })),
    deleteBlink: (id) => setState((s) => ({ ...s, blinks: s.blinks.filter((b) => b.id !== id) })),
  }), [state])

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}

export function useStore() {
  return useContext(StoreCtx)
}

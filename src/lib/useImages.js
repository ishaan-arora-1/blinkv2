import { useEffect, useRef, useState } from 'react'
import { blobURL } from './idb.js'

// Resolves a set's images to displayable URLs.
// Builtin sets store URL strings; custom sets store {key} refs into IndexedDB.
export function useSetImages(set) {
  const [urls, setUrls] = useState([])
  const setRef = useRef(set)
  setRef.current = set
  // depend on stable keys, not object identity — a new wrapper object per render
  // must not retrigger resolution (that caused an infinite effect loop)
  useEffect(() => {
    let alive = true
    const s = setRef.current
    if (!s) { setUrls([]); return }
    Promise.all(
      (s.images || []).map((img) => (typeof img === 'string' ? Promise.resolve(img) : blobURL(img.key)))
    ).then((r) => { if (alive) setUrls(r.filter(Boolean)) })
    return () => { alive = false }
  }, [set?.id, set?.images?.length])
  return urls
}

// Resolve a single image ref (string URL or {key}) to a URL
export async function resolveImage(img) {
  if (!img) return null
  if (typeof img === 'string') return img
  return blobURL(img.key)
}

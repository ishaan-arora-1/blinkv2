import { useEffect, useRef, useState } from 'react'
import { UPLOADS, signedUrl } from './storage.js'
import { isGradientRef, gradientByRef } from './library.js'

/**
 * An image reference is one of three things, and this is the only place that
 * needs to know the difference:
 *
 *   "/sets/boy/01.jpg"   a built-in asset served from /public
 *   "gradient:3"         a locally generated gradient, painted on demand
 *   { path: "uid/..." }  an upload in the private storage bucket
 *
 * Everything resolves to a URL you can put in a src or a background-image.
 */
export async function resolveImage(img) {
  if (!img) return null
  if (typeof img === 'string') {
    if (isGradientRef(img)) return gradientByRef(img)
    return img
  }
  if (img.path) return signedUrl(UPLOADS, img.path)
  return null
}

export async function resolveImages(images) {
  return Promise.all((images || []).map(resolveImage))
}

/**
 * Resolve a whole set's images for display.
 *
 * The dependency list is the set id and image count rather than the set object:
 * callers build a fresh wrapper object every render, and depending on its
 * identity re-ran this forever.
 */
export function useSetImages(set) {
  const [urls, setUrls] = useState([])
  const setRef = useRef(set)
  setRef.current = set

  useEffect(() => {
    let alive = true
    const s = setRef.current
    if (!s) {
      setUrls([])
      return
    }
    resolveImages(s.images).then((r) => {
      if (alive) setUrls(r.filter(Boolean))
    })
    return () => {
      alive = false
    }
  }, [set?.id, set?.images?.length])

  return urls
}

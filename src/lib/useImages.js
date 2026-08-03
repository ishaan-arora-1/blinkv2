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
 * Swap a built-in set photo for its 360×450 thumbnail — for display only.
 *
 * The originals are ~450 KB each because they are what carousels export from at
 * 1080 × 1350. A picker showing four sets of them downloads several megabytes to
 * draw thumbnails a couple of hundred pixels wide.
 *
 * Anything that is not a built-in set path — an upload's signed URL, a gradient
 * data URL — is returned untouched, and this must never be fed back into a
 * slide's background: it is a URL for an <img>, not an image reference.
 */
export function displayThumb(url) {
  if (typeof url !== 'string') return url
  return url.startsWith('/sets/') ? url.replace('/sets/', '/sets/thumbs/') : url
}

/**
 * Resolve a single image reference for display.
 *
 * Every thumbnail needs this, and skipping it is not a graceful degradation: a
 * "gradient:3" reference put straight into background-image becomes
 * `url(gradient:3)`, which is not a URL, so the browser paints nothing and the
 * preview is simply blank.
 *
 * The ref is passed to the effect as a stable key rather than as an object,
 * because upload refs are fresh objects on every render.
 */
export function useResolvedImage(img) {
  const [url, setUrl] = useState(null)
  const ref = useRef(img)
  ref.current = img

  const key = typeof img === 'string' ? img : img?.path || null

  useEffect(() => {
    let alive = true
    if (!ref.current) {
      setUrl(null)
      return
    }
    resolveImage(ref.current).then((r) => {
      if (alive) setUrl(r)
    })
    return () => {
      alive = false
    }
  }, [key])

  return url
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

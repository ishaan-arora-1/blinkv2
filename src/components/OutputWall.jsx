import React, { useEffect, useRef } from 'react'
import { OUTPUTS } from '../lib/outputs.js'

/**
 * The wall of real generations, playing.
 *
 * Fifteen clips is a claim no sentence makes as well: the product does not
 * produce one good demo, it produces this much. They play rather than sit as
 * stills because a grid of motionless 9:16 thumbnails reads as a stock-photo
 * page, and the one thing a video generator has to prove above the fold is
 * that the video moves.
 *
 * Nothing loads until the wall is nearly on screen. Fifteen autoplaying videos
 * is three megabytes, which is fine to spend on somebody who scrolled to them
 * and wasteful on somebody who bounced off the hero — so the observer flips
 * preload from "none" to "auto" at the last moment and pauses everything on
 * the way out, which also stops fifteen decoders running behind the footer.
 */
export default function OutputWall({ items = OUTPUTS }) {
  const ref = useRef(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const vids = [...root.querySelectorAll('video')]
    if (reduced) return undefined

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target
          if (e.isIntersecting) {
            v.preload = 'auto'
            v.play().catch(() => {})
          } else {
            v.pause()
          }
        }
      },
      { rootMargin: '300px' }
    )

    vids.forEach((v) => io.observe(v))
    return () => io.disconnect()
  }, [])

  return (
    <div className="ow" ref={ref}>
      <div className="ow-track">
        {items.map((o) => (
          <figure className="ow-tile" key={o.id}>
            <video
              src={o.src}
              poster={o.poster}
              muted
              loop
              playsInline
              preload="none"
              aria-label={`Blink output — ${o.label}`}
            />
            <figcaption>{o.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

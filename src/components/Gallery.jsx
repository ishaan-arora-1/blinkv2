import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One category of output, as a row that runs off both edges of the page.
 *
 * A grid that fits the column turns twenty-three clips into a tidy nine and
 * quietly makes the product look smaller than it is. A row that overflows says
 * there is more without having to claim it, and the arrows make that legible
 * to anyone who is not going to think to drag a video sideways.
 *
 * Nothing loads until the row is nearly on screen: a page with four of these
 * is forty videos, which is fine to spend on somebody who scrolled to them and
 * wasteful on somebody who bounced off the hero. The observer flips preload
 * from "none" to "auto" at the last moment and pauses on the way out, which
 * also stops forty decoders running behind the footer.
 */
export default function Gallery({ title, note, items, kind = 'video', onPlay }) {
  const trackRef = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  // Autoplay only what is on screen, and only for people who want motion.
  useEffect(() => {
    const root = trackRef.current
    if (!root || kind !== 'video') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined

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
      { rootMargin: '400px' }
    )
    const vids = [...root.querySelectorAll('video')]
    vids.forEach((v) => io.observe(v))
    return () => io.disconnect()
  }, [kind, items])

  // Which arrows are live. Two pixels of slack because a scroll container that
  // has been scrolled to its end is routinely a fraction of a pixel short.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdge({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    })
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, items])

  function nudge(dir) {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="gal">
      <div className="gal-head">
        <h2>{title}</h2>
        <div className="gal-head-right">
          {note && <span className="gal-note">{note}</span>}
          <div className="gal-arrows">
            <button type="button" onClick={() => nudge(-1)} disabled={edge.start} aria-label={`Scroll ${title} left`}>←</button>
            <button type="button" onClick={() => nudge(1)} disabled={edge.end} aria-label={`Scroll ${title} right`}>→</button>
          </div>
        </div>
      </div>

      <div className={`gal-track${kind === 'still' ? ' still' : ''}`} ref={trackRef} onScroll={measure}>
        {items.map((it) => (
          <GalleryCard key={it.id} item={it} kind={kind} onPlay={onPlay} />
        ))}
      </div>
    </section>
  )
}

function GalleryCard({ item, kind, onPlay }) {
  const playable = kind === 'video' && typeof onPlay === 'function'
  const Tag = playable ? 'button' : 'div'

  return (
    <figure className="gal-card">
      <Tag
        className="gal-media"
        {...(playable
          ? { type: 'button', onClick: () => onPlay(item), 'aria-label': `Play ${item.label}` }
          : {})}
      >
        {kind === 'video' ? (
          <video
            src={item.src}
            poster={item.poster}
            muted
            loop
            playsInline
            preload="none"
            aria-label={`Blink output — ${item.label}`}
          />
        ) : (
          <img src={item.src} alt={`Blink still — ${item.label}`} loading="lazy" decoding="async" />
        )}
        {item.kind === 'blink' && <span className="gal-badge">Blink AI</span>}
        {playable && <span className="gal-play" aria-hidden="true">▶</span>}
      </Tag>
      <figcaption>
        <span className="gal-title">{item.label}</span>
        {typeof item.seconds === 'number' && <span className="gal-dur">{fmt(item.seconds)}</span>}
      </figcaption>
    </figure>
  )
}

/** 21 → "0:21". The card is a video card; a bare "21s" reads as a spec. */
function fmt(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`
}

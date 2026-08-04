import React from 'react'

/**
 * A carousel slide, rendered at any size.
 *
 * Two shapes are accepted, and they render identically:
 *
 *   { img }                — a finished export, dropped into /public
 *   { bg, dim, texts }     — composed live from the copy generator
 *
 * so a placeholder composition can be swapped for the real exported PNG by
 * changing data alone.
 *
 * Type is sized in `cqw` against the slide's own width rather than in px. The
 * editor solves the same problem by measuring the stage with a ResizeObserver
 * and scaling every layer by `width / 380` (see useStageScale in
 * CarouselEditor.jsx); a container query gets there without the measurement,
 * which matters here because the page renders several of these at once and at
 * different sizes.
 */

const FONTS = { display: 'var(--display)', body: 'var(--body)', serif: 'var(--serif)' }

// The editor's design width. Layer sizes are authored against it, so this is
// what turns a px size into a proportion of the slide.
const STAGE_W = 380

const cqw = (px) => `${(px / STAGE_W) * 100}cqw`

export default function SlidePreview({ slide, className = '', style, alt = '' }) {
  if (!slide) return null

  if (slide.img) {
    return (
      <div className={`lp-slide ${className}`} style={style}>
        <img src={slide.img} alt={alt} loading="lazy" />
      </div>
    )
  }

  return (
    <div
      className={`lp-slide ${className}`}
      style={{ backgroundImage: `url("${slide.bg}")`, ...style }}
      role="img"
      aria-label={alt || slide.texts?.[0]?.text}
    >
      <div className="lp-slide-dim" style={{ background: `rgba(6,8,6,${slide.dim ?? 0.5})` }} />
      {(slide.texts || []).map((t, i) => (
        <div key={i} className="lp-slide-txt" style={layerStyle(t)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Mirrors TextLayer's style block in CarouselEditor.jsx, in cqw rather than px. */
function layerStyle(t) {
  const pad = `${cqw(8)} ${cqw(16)}`
  const pill =
    t.pill === 'dark'
      ? { background: 'rgba(8,10,8,0.82)', padding: pad, borderRadius: cqw(10) }
      : t.pill === 'accent'
        ? { background: 'var(--pill-accent, #c9a4ff)', padding: pad, borderRadius: 999 }
        : {}

  return {
    left: `${t.x}%`,
    top: `${t.y}%`,
    width: `${t.width}%`,
    fontSize: cqw(t.size),
    fontWeight: t.weight,
    color: t.color,
    textAlign: t.align,
    fontFamily: FONTS[t.font] || FONTS.body,
    textTransform: t.upper ? 'uppercase' : 'none',
    lineHeight: 1.18,
    textShadow: t.pill === 'none' ? '0 2px 14px rgba(0,0,0,0.45)' : 'none',
    letterSpacing: t.font === 'display' ? '-0.01em' : '0',
    ...pill,
  }
}

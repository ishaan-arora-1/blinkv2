import React from 'react'

/**
 * The Blink UGC lockup: the mark as an asset, the wordmark as live type.
 *
 * Defined once so the sidebar, the landing page and onboarding cannot drift
 * apart — three hand-rolled copies of a logo is how a product ends up with
 * three slightly different logos.
 */
export default function Logo({ size = 26, word = true, className = '', style }) {
  return (
    <span className={`logo ${className}`} style={style}>
      <img
        className="logo-mark"
        src="/brand/icon.png"
        alt="Blink UGC"
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
      {word && (
        <span className="logo-word" style={{ fontSize: Math.round(size * 0.69) }}>
          <span className="a">blink</span> <span className="b">ugc</span>
        </span>
      )}
    </span>
  )
}

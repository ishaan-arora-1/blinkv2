import React, { useRef, useState } from 'react'
import { hookPoster } from '../lib/creators.js'

/**
 * A 9:16 preview of a hook clip that shows its poster frame and plays the clip
 * on hover (or on tap, where there is no hover).
 *
 * The clips are around 5 MB each. Anywhere several are on screen at once, the
 * video element carries `preload="none"` so nothing is fetched until the user
 * shows interest — the poster alone is enough to tell them what they are
 * choosing, and it costs ~30 KB.
 */
export default function HookPreview({ hook, fallbackImg, alt = '', className = '', style, eager = false }) {
  const vidRef = useRef(null)
  const [touched, setTouched] = useState(false)
  const poster = hookPoster(hook) || fallbackImg || undefined

  const play = () => vidRef.current?.play().catch(() => {})
  const stop = () => {
    const v = vidRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <div
      className={`thumb-9x16 ${className}`}
      style={{ padding: 0, ...style }}
      onMouseEnter={play}
      onMouseLeave={stop}
      // On touch there is no hover, so the first tap starts playback. The parent
      // still receives the tap, so a tile that navigates on click keeps working.
      onTouchStart={() => {
        if (!touched) setTouched(true)
        play()
      }}
    >
      {hook?.src ? (
        <video
          ref={vidRef}
          src={hook.src}
          poster={poster}
          muted
          loop
          playsInline
          preload={eager ? 'metadata' : 'none'}
        />
      ) : (
        poster && <img src={poster} alt={alt} loading="lazy" />
      )}
    </div>
  )
}

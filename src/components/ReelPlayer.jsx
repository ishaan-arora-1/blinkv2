import React, { useEffect, useRef, useState } from 'react'
import { createCompositor, REEL_W, REEL_H } from '../lib/reelCompositor.js'

/**
 * Plays a finished reel as one video, and exports it as one file.
 *
 * The clips stay separate all the way to the export: there is no server-side
 * stitch, and the combined video only exists at the moment it is recorded. That
 * follows the hook-video editor, which composites its two parts the same way —
 * one canvas, one MediaRecorder, no ffmpeg anywhere in the product.
 *
 * Scenes that failed are dropped rather than held as gaps. A reel is playable
 * as long as one scene rendered, and a black hole where scene three should be
 * is worse than a shorter reel.
 */
export default function ReelPlayer({ reel }) {
  const canvasRef = useRef(null)
  const videoRefs = useRef([])
  const compRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [exporting, setExporting] = useState(null)
  const [copied, setCopied] = useState(false)

  const clips = (reel.scenes || []).filter((s) => s.status === 'ready' && s.videoUrl)
  const perClip = reel.durationSeconds || 8
  const total = clips.length * perClip

  // Build the compositor once every clip element can actually render a frame.
  // Starting earlier draws black: readyState < 2 means drawImage is a no-op,
  // and the first seconds of the export would be empty.
  useEffect(() => {
    setReady(false)
    if (!clips.length) return

    let cancelled = false
    const els = videoRefs.current.slice(0, clips.length).filter(Boolean)
    if (els.length !== clips.length) return

    Promise.all(
      els.map(
        (el) =>
          new Promise((resolve) => {
            if (el.readyState >= 2) return resolve()
            el.addEventListener('loadeddata', resolve, { once: true })
            el.addEventListener('error', resolve, { once: true })
          })
      )
    ).then(() => {
      if (cancelled || !canvasRef.current) return

      compRef.current = createCompositor({
        canvas: canvasRef.current,
        clips: els.map((video) => ({ video, duration: perClip })),
        onTick: setT,
        onEnd: () => setPlaying(false),
      })
      setReady(true)
    })

    return () => {
      cancelled = true
      compRef.current?.destroy()
      compRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.multiframeId, clips.length, perClip])

  function toggle() {
    const c = compRef.current
    if (!c) return
    if (c.isPlaying()) {
      c.pause()
      setPlaying(false)
    } else {
      c.play()
      setPlaying(true)
    }
  }

  async function download() {
    const c = compRef.current
    if (!c || exporting) return
    setExporting({ pct: 0 })
    setPlaying(true)
    try {
      const blob = await c.exportReel({ onProgress: (pct) => setExporting({ pct }) })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${slug(reel.name || 'multiframe')}.webm`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(null)
      setPlaying(false)
      c.seek(0)
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(reel.script || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  if (!clips.length) {
    return (
      <div className="card mt-6" style={{ maxWidth: 780 }}>
        <div className="row"><span className="chip hot">nothing to play</span></div>
        <div className="small mt-2">No scene in this reel finished rendering.</div>
      </div>
    )
  }

  return (
    <div className="card mt-6" style={{ maxWidth: 780 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h4 style={{ color: 'var(--accent)' }}>{reel.name || 'Your reel'}</h4>
        <button className="btn sm" disabled={!ready || !!exporting} onClick={download}>
          {exporting ? `⬇ Recording… ${exporting.pct}%` : '⬇ Download the reel'}
        </button>
      </div>

      <div className="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          {/* crossOrigin is load-bearing, not decorative: these are Supabase
              signed URLs, and without it the canvas is tainted and the export
              produces an unusable file. */}
          {clips.map((s, i) => (
            <video
              key={s.idx}
              ref={(el) => { videoRefs.current[i] = el }}
              src={s.videoUrl}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              style={{ display: 'none' }}
            />
          ))}

          <canvas
            ref={canvasRef}
            width={REEL_W}
            height={REEL_H}
            onClick={toggle}
            style={{
              width: 270,
              borderRadius: 14,
              display: 'block',
              border: '1px solid var(--line)',
              cursor: ready ? 'pointer' : 'default',
              background: '#000',
            }}
          />

          <div className="row between mt-2" style={{ width: 270 }}>
            <button className="btn xs" disabled={!ready || !!exporting} onClick={toggle}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <span className="small muted">{t.toFixed(1)}s / {total}s</span>
          </div>

          <input
            type="range" min="0" max={total} step="0.05" value={Math.min(t, total)}
            disabled={!ready || !!exporting}
            onChange={(e) => { compRef.current?.seek(parseFloat(e.target.value)) }}
            style={{ width: 270, marginTop: 8 }}
          />
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 260 }}>
          <div className="row between">
            <label className="small muted">Voiceover script</label>
            {reel.script && (
              <button className="btn ghost xs" onClick={copyScript}>{copied ? 'Copied' : 'Copy'}</button>
            )}
          </div>
          <div className="small mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {reel.script || 'No script was written for this reel.'}
          </div>

          <div className="row mt-4 wrap">
            <span className="chip">{clips.length} scenes</span>
            <span className="chip">{total}s</span>
            <span className="chip">{reel.aspectRatio}</span>
            <span className="chip accent">audio</span>
          </div>
        </div>
      </div>

      <div className="small muted mt-4">
        The download is recorded in real time, so it takes about {total} seconds and needs this tab
        to stay in front.
      </div>
    </div>
  )
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'multiframe'

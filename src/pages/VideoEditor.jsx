import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { TRACKS, scheduleTrack } from '../lib/audio.js'
import { putBlob, blobURL, uid } from '../lib/idb.js'

const W = 540, H = 960

function drawOverlay(ctx, ov) {
  const S = W / 1080
  ctx.save()
  const fontSize = (ov.size || 64) * S
  ctx.font = `800 ${fontSize}px "Familjen Grotesk", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const words = (ov.text || '').split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > W * 0.84 && line) { lines.push(line); line = w } else line = test
  }
  lines.push(line)
  const lh = fontSize * 1.24
  const baseY = (ov.y / 100) * H
  lines.forEach((ln, i) => {
    const y = baseY + i * lh
    if (ov.pill) {
      const tw = ctx.measureText(ln).width
      ctx.fillStyle = 'rgba(8,10,8,0.88)'
      ctx.beginPath()
      ctx.roundRect(W / 2 - tw / 2 - 28 * S, y - lh / 2 + 2, tw + 56 * S, lh, 12 * S)
      ctx.fill()
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 12
    }
    ctx.fillStyle = ov.color || '#ffffff'
    ctx.fillText(ln, W / 2, y)
    ctx.shadowBlur = 0
  })
  ctx.restore()
}

function drawVideoFrame(ctx, video) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  if (!video || video.readyState < 2) return
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return
  const scale = Math.max(W / vw, H / vh)
  const dw = vw * scale, dh = vh * scale
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function drawPlaceholder(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#101512'); g.addColorStop(1, '#0a0d0b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#8fa196'
  ctx.font = `600 22px "Familjen Grotesk", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('Upload your app demo', W / 2, H / 2 - 10)
  ctx.font = `400 15px "Familjen Grotesk", sans-serif`
  ctx.fillText('(screen recording — it plays after the hook)', W / 2, H / 2 + 20)
}

// keep a media element in sync with the compositor clock
function syncVideo(video, desired, playing, active) {
  if (!video) return
  if (!active) {
    if (!video.paused) video.pause()
    return
  }
  if (playing) {
    if (video.paused) { video.currentTime = desired; video.play().catch(() => {}) }
    else if (Math.abs(video.currentTime - desired) > 0.35) video.currentTime = desired
  } else if (Math.abs(video.currentTime - desired) > 0.05) {
    video.currentTime = desired
  }
}

export default function VideoEditor({ id }) {
  const store = useStore()
  const proj = store.state.videos.find((v) => v.id === id)
  const char = proj ? store.getCharacter(proj.characterId) : null

  const canvasRef = useRef(null)
  const hookRef = useRef(null)
  const demoRef = useRef(null)
  const fileRef = useRef(null)
  const audioCtxRef = useRef(null)

  const [demoURL, setDemoURL] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [exporting, setExporting] = useState(null)
  const [selOverlay, setSelOverlay] = useState(null)

  const tRef = useRef(0)
  const playingRef = useRef(false)
  const projRef = useRef(proj)
  projRef.current = proj

  const hookDur = Math.min(proj?.hook.duration ?? 3, proj?.hook.maxDuration ?? 3)
  const demoSeg = proj?.demoKey ? Math.max(0, (proj.demoTrim.end || 0) - (proj.demoTrim.start || 0)) : 0
  const total = hookDur + demoSeg

  useEffect(() => {
    let alive = true
    if (proj?.demoKey) blobURL(proj.demoKey).then((u) => alive && setDemoURL(u))
    else setDemoURL(null)
    return () => { alive = false }
  }, [proj?.demoKey])

  // ── render loop ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !proj || !char || !proj.hook?.src) return
    const ctx = canvas.getContext('2d')
    let raf
    let last = performance.now()

    const loop = (now) => {
      const dt = (now - last) / 1000
      last = now
      const p = projRef.current
      if (!p) return
      const hd = Math.min(p.hook.duration, p.hook.maxDuration ?? 3)
      const dSeg = p.demoKey ? Math.max(0, p.demoTrim.end - p.demoTrim.start) : 0
      const tot = hd + dSeg

      if (playingRef.current) {
        tRef.current += dt
        if (tRef.current >= tot) {
          tRef.current = 0
          stopPlayback()
        }
        setT(tRef.current)
      }

      const tt = tRef.current
      const inHook = tt < hd

      syncVideo(hookRef.current, Math.min(tt, hd), playingRef.current, inHook)
      syncVideo(demoRef.current, p.demoTrim.start + Math.max(0, tt - hd), playingRef.current, !inHook && !!p.demoKey)

      if (inHook) {
        drawVideoFrame(ctx, hookRef.current)
        if (p.hook.caption) drawOverlay(ctx, { text: p.hook.caption, y: 13, size: 58, color: '#eaffd0', pill: true })
      } else if (p.demoKey) {
        drawVideoFrame(ctx, demoRef.current)
      } else {
        drawPlaceholder(ctx)
      }

      for (const ov of p.overlays) {
        if (tt >= ov.start && tt <= ov.end) drawOverlay(ctx, ov)
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [proj?.id, char, demoURL, proj?.hook?.src])

  function stopAudio() {
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }
  function startAudio(fromT, dest = null) {
    stopAudio()
    const p = projRef.current
    if (!p.audio.trackId) return null
    const actx = new AudioContext()
    audioCtxRef.current = actx
    const hd = Math.min(p.hook.duration, p.hook.maxDuration ?? 3)
    const dSeg = p.demoKey ? Math.max(0, p.demoTrim.end - p.demoTrim.start) : 0
    const remaining = hd + dSeg - fromT
    scheduleTrack(actx, dest || actx.destination, p.audio.trackId, actx.currentTime + 0.05, Math.max(0.1, remaining), p.audio.volume)
    return actx
  }

  function play() {
    playingRef.current = true
    setPlaying(true)
    startAudio(tRef.current)
  }
  function stopPlayback() {
    playingRef.current = false
    setPlaying(false)
    stopAudio()
    hookRef.current?.pause()
    demoRef.current?.pause()
  }
  function seek(newT) {
    tRef.current = Math.max(0, Math.min(total, newT))
    setT(tRef.current)
    if (playingRef.current) startAudio(tRef.current)
  }

  useEffect(() => () => { stopAudio() }, [])

  if (!proj || !char || !proj.hook?.src) {
    return (
      <div className="empty mt-6">
        {proj ? 'This project was made with the old character system — create a new video.' : 'Video not found.'}{' '}
        <a href="#/videos" style={{ color: 'var(--mint)' }}>Back to videos</a>
      </div>
    )
  }

  function save(patch) { store.saveVideo({ ...proj, ...patch }) }

  function switchHook(h) {
    save({ hook: { ...proj.hook, id: h.id, src: h.src, label: h.label, maxDuration: h.maxDuration, duration: Math.min(proj.hook.duration, h.maxDuration) } })
    seek(0)
  }

  // ── demo upload ──────────────────────────────────────────
  async function onDemoFile(file) {
    if (!file) return
    const key = uid('demo')
    await putBlob(key, file)
    const url = URL.createObjectURL(file)
    const meta = document.createElement('video')
    meta.preload = 'metadata'
    meta.src = url
    meta.onloadedmetadata = () => {
      if (!isFinite(meta.duration)) {
        meta.onloadedmetadata = null
        meta.ondurationchange = () => {
          if (isFinite(meta.duration) && meta.duration > 0) {
            meta.ondurationchange = null
            const dur = meta.duration
            save({ demoKey: key, demoDuration: dur, demoTrim: { start: 0, end: Math.min(dur, 20) } })
          }
        }
        meta.currentTime = 1e10
        return
      }
      const dur = meta.duration
      save({ demoKey: key, demoDuration: dur, demoTrim: { start: 0, end: Math.min(dur, 20) } })
    }
  }

  // ── export ───────────────────────────────────────────────
  async function exportVideo() {
    stopPlayback()
    seek(0)
    await new Promise((r) => setTimeout(r, 100))

    const canvas = canvasRef.current
    const stream = canvas.captureStream(30)
    let actx = null
    if (proj.audio.trackId) {
      actx = new AudioContext()
      const dest = actx.createMediaStreamDestination()
      scheduleTrack(actx, dest, proj.audio.trackId, actx.currentTime + 0.1, total, proj.audio.volume)
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    }

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m)) || ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise((res) => { rec.onstop = res })
    rec.start(200)

    playingRef.current = true
    setPlaying(true)
    setExporting({ pct: 0 })
    const t0 = performance.now()
    await new Promise((res) => {
      const tick = () => {
        const el = (performance.now() - t0) / 1000
        setExporting({ pct: Math.min(99, Math.round((el / total) * 100)) })
        if (el >= total + 0.2 || !playingRef.current) res()
        else setTimeout(tick, 120)
      }
      tick()
    })
    playingRef.current = false
    setPlaying(false)
    hookRef.current?.pause()
    demoRef.current?.pause()
    rec.stop()
    await done
    if (actx) actx.close().catch(() => {})
    stopAudio()

    const blob = new Blob(chunks, { type: mime || 'video/webm' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`
    a.click()
    setExporting(null)
    seek(0)
  }

  const overlay = proj.overlays.find((o) => o.id === selOverlay)
  const fmt = (x) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`

  return (
    <div>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div className="row">
          <button className="btn ghost sm" onClick={() => { stopPlayback(); window.location.hash = '/videos' }}>← Back</button>
          <input className="input" style={{ width: 300, fontWeight: 700 }} value={proj.name} onChange={(e) => save({ name: e.target.value })} />
          <span className="chip sea">{char.name} — {proj.hook.label}</span>
        </div>
        <button className="btn primary sm" onClick={exportVideo} disabled={!!exporting}>⬇ Export video</button>
      </div>

      <div className="editor-layout" style={{ gridTemplateColumns: '1fr 320px' }}>
        {/* ── preview + timeline ── */}
        <div className="stage-wrap">
          <div className="video-canvas-wrap">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: 300, display: 'block' }} />
          </div>
          <video ref={hookRef} src={proj.hook.src} muted playsInline preload="auto" style={{ display: 'none' }} />
          <video
            ref={demoRef} src={demoURL || undefined} muted playsInline preload="auto" style={{ display: 'none' }}
            onLoadedMetadata={(e) => {
              const v = e.target
              if (!isFinite(v.duration)) {
                v.ondurationchange = () => { if (isFinite(v.duration)) { v.ondurationchange = null; v.currentTime = 0 } }
                v.currentTime = 1e10
              }
            }}
          />

          <div className="row" style={{ width: 480 }}>
            <button className="btn sm" onClick={playing ? stopPlayback : play}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <input type="range" min="0" max={total} step="0.02" value={t} onChange={(e) => seek(parseFloat(e.target.value))} />
            <span className="mono small muted" style={{ minWidth: 86 }}>{fmt(t)} / {fmt(total)}</span>
          </div>

          <div className="timeline" style={{ width: 480 }}>
            <div className={`seg-block hook ${t < hookDur ? 'on' : ''}`} style={{ flex: hookDur }} onClick={() => seek(0)}>
              Hook · {hookDur.toFixed(1)}s
            </div>
            <div
              className={`seg-block demo ${t >= hookDur ? 'on' : ''}`}
              style={{ flex: Math.max(demoSeg, 0.5) }}
              onClick={() => (proj.demoKey ? seek(hookDur + 0.01) : fileRef.current?.click())}
            >
              {proj.demoKey ? `Demo · ${demoSeg.toFixed(1)}s` : '+ upload demo'}
            </div>
          </div>
        </div>

        {/* ── inspector ── */}
        <div className="inspector">
          <div className="card">
            <h4>Hook — {char.name}</h4>
            <div className="field mt-2">
              <label>Reaction</label>
              <div className="grid" style={{ gap: 6 }}>
                {char.hooks.map((h) => (
                  <button key={h.id} className={`btn sm ${proj.hook.id === h.id ? 'primary' : ''}`}
                    style={{ justifyContent: 'flex-start', borderRadius: 8 }}
                    onClick={() => switchHook(h)}>
                    ▶ {h.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Caption over the hook</label>
              <textarea className="input" value={proj.hook.caption}
                onChange={(e) => save({ hook: { ...proj.hook, caption: e.target.value } })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Trim hook — {hookDur.toFixed(1)}s</label>
              <input type="range" min="1" max={proj.hook.maxDuration ?? 3} step="0.1" value={hookDur}
                onChange={(e) => save({ hook: { ...proj.hook, duration: parseFloat(e.target.value) } })} />
            </div>
          </div>

          <div className="card">
            <div className="row between">
              <h4>App demo</h4>
              <button className="btn xs" onClick={() => fileRef.current?.click()}>{proj.demoKey ? 'Replace' : 'Upload'}</button>
              <input ref={fileRef} type="file" accept="video/*" hidden
                onChange={(e) => { onDemoFile(e.target.files[0]); e.target.value = '' }} />
            </div>
            {proj.demoKey ? (
              <>
                <div className="field mt-2">
                  <label>Trim start — {proj.demoTrim.start.toFixed(1)}s</label>
                  <input type="range" min="0" max={Math.max(0, proj.demoDuration - 0.5)} step="0.1" value={proj.demoTrim.start}
                    onChange={(e) => {
                      const start = parseFloat(e.target.value)
                      save({ demoTrim: { start, end: Math.max(proj.demoTrim.end, start + 0.5) } })
                    }} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Trim end — {proj.demoTrim.end.toFixed(1)}s</label>
                  <input type="range" min="0.5" max={proj.demoDuration} step="0.1" value={proj.demoTrim.end}
                    onChange={(e) => {
                      const end = parseFloat(e.target.value)
                      save({ demoTrim: { start: Math.min(proj.demoTrim.start, end - 0.5), end } })
                    }} />
                </div>
              </>
            ) : (
              <div className="small muted mt-2">Screen-record your app on iPhone, then upload it here.</div>
            )}
          </div>

          <div className="card">
            <h4>Music</h4>
            <div className="grid mt-2" style={{ gap: 6 }}>
              <button className={`btn sm ${!proj.audio.trackId ? 'primary' : ''}`} style={{ justifyContent: 'flex-start', borderRadius: 8 }}
                onClick={() => save({ audio: { ...proj.audio, trackId: null } })}>No music</button>
              {TRACKS.map((tr) => (
                <button key={tr.id} className={`btn sm ${proj.audio.trackId === tr.id ? 'primary' : ''}`}
                  style={{ justifyContent: 'flex-start', borderRadius: 8 }}
                  onClick={() => { save({ audio: { ...proj.audio, trackId: tr.id } }); if (playingRef.current) startAudio(tRef.current) }}>
                  ♪ {tr.name} <span className="small" style={{ opacity: 0.6, fontWeight: 400 }}>— {tr.desc}</span>
                </button>
              ))}
            </div>
            <div className="field mt-4" style={{ marginBottom: 0 }}>
              <label>Volume — {Math.round(proj.audio.volume * 100)}%</label>
              <input type="range" min="0" max="1" step="0.05" value={proj.audio.volume}
                onChange={(e) => save({ audio: { ...proj.audio, volume: parseFloat(e.target.value) } })} />
            </div>
          </div>

          <div className="card">
            <div className="row between">
              <h4>Text overlays</h4>
              <button className="btn xs" onClick={() => {
                const ov = { id: uid('ov'), text: 'Link in bio 🔗', start: Math.min(hookDur, total - 0.1), end: total, y: 78, size: 60, color: '#ffffff', pill: true }
                save({ overlays: [...proj.overlays, ov] })
                setSelOverlay(ov.id)
              }}>+ Add</button>
            </div>
            <div className="grid mt-2" style={{ gap: 6 }}>
              {proj.overlays.map((o) => (
                <button key={o.id} className={`btn sm ${o.id === selOverlay ? 'primary' : ''}`}
                  style={{ justifyContent: 'flex-start', overflow: 'hidden', whiteSpace: 'nowrap', borderRadius: 8 }}
                  onClick={() => setSelOverlay(o.id)}>
                  {o.text.slice(0, 24)} <span className="small" style={{ opacity: 0.6 }}>· {o.start.toFixed(1)}–{o.end.toFixed(1)}s</span>
                </button>
              ))}
              {proj.overlays.length === 0 && <div className="small muted">Captions, CTAs, feature callouts…</div>}
            </div>
            {overlay && (
              <div className="mt-4" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <div className="field">
                  <label>Text</label>
                  <textarea className="input" value={overlay.text}
                    onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, text: e.target.value } : o) })} />
                </div>
                <div className="grid cols-2">
                  <div className="field">
                    <label>Starts — {overlay.start.toFixed(1)}s</label>
                    <input type="range" min="0" max={total} step="0.1" value={overlay.start}
                      onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, start: Math.min(parseFloat(e.target.value), o.end - 0.1) } : o) })} />
                  </div>
                  <div className="field">
                    <label>Ends — {overlay.end.toFixed(1)}s</label>
                    <input type="range" min="0" max={total} step="0.1" value={overlay.end}
                      onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, end: Math.max(parseFloat(e.target.value), o.start + 0.1) } : o) })} />
                  </div>
                </div>
                <div className="grid cols-2">
                  <div className="field">
                    <label>Position — {overlay.y}%</label>
                    <input type="range" min="8" max="92" value={overlay.y}
                      onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, y: +e.target.value } : o) })} />
                  </div>
                  <div className="field">
                    <label>Size — {overlay.size}</label>
                    <input type="range" min="30" max="110" value={overlay.size}
                      onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, size: +e.target.value } : o) })} />
                  </div>
                </div>
                <div className="row between">
                  <div className="row">
                    <input type="color" value={overlay.color}
                      onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, color: e.target.value } : o) })} />
                    <label className="row small muted" style={{ gap: 6 }}>
                      <input type="checkbox" checked={overlay.pill}
                        onChange={(e) => save({ overlays: proj.overlays.map((o) => o.id === overlay.id ? { ...o, pill: e.target.checked } : o) })} />
                      pill background
                    </label>
                  </div>
                  <button className="btn xs danger" onClick={() => { save({ overlays: proj.overlays.filter((o) => o.id !== overlay.id) }); setSelOverlay(null) }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {exporting && (
        <div className="modal-veil">
          <div className="modal" style={{ width: 340, textAlign: 'center' }}>
            <div className="tick" style={{ fontSize: 30, marginBottom: 10 }}>⏺</div>
            <b>Recording your video…</b>
            <div className="progress-bar mt-4"><div style={{ width: `${exporting.pct}%` }} /></div>
            <div className="small muted mt-2">Exports in real time — {exporting.pct}%</div>
          </div>
        </div>
      )}
    </div>
  )
}

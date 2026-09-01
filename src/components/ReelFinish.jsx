import React, { useEffect, useRef, useState } from 'react'
import { createCompositor, buildCues, REEL_W, REEL_H } from '../lib/reelCompositor.js'
import { saveScript, generateVoiceover, saveTiming, saveCut, CUT_LABEL, slug } from '../lib/multiframe.js'
import DownloadButton from './DownloadButton.jsx'

/**
 * The finishing studio: preview the cut, narrate it, caption it, keep every
 * version.
 *
 * One preview with switches rather than three buttons that each render a
 * slightly different video. The switches decide what the recording contains,
 * and what it contains decides which version it is saved as — so a cut with
 * subtitles never overwrites the cut without them, and there is exactly one
 * place to look at what you are about to record.
 */
export default function ReelFinish({ reel, voices, onRefresh }) {
  const canvasRef = useRef(null)
  const videoRefs = useRef([])
  const voiceRef = useRef(null)
  const compRef = useRef(null)

  const clips = (reel.scenes || []).filter((s) => s.status === 'ready' && s.videoUrl)
  const fullLength = reel.durationSeconds || 8

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)

  const [script, setScript] = useState(reel.script || '')
  const [voice, setVoice] = useState(reel.voice || 'Rachel')
  const [savingScript, setSavingScript] = useState(false)
  const [narrating, setNarrating] = useState(false)

  const [voiceOn, setVoiceOn] = useState(Boolean(reel.voiceoverUrl))
  const [subsOn, setSubsOn] = useState(false)

  const [trims, setTrims] = useState(() => clips.map((s) => s.trimSeconds ?? fullLength))
  const [offset, setOffset] = useState(reel.voOffsetSeconds ?? 0)

  const [recording, setRecording] = useState(null)
  const [error, setError] = useState(null)

  const total = trims.reduce((n, d) => n + d, 0)
  const hasVoice = Boolean(reel.voiceoverUrl)
  const scriptDirty = script.trim() !== (reel.script || '').trim()
  // Subtitles are cut from the narration's own word timings, so they cannot
  // exist without it.
  const canSubtitle = hasVoice && (reel.voiceoverWords || []).length > 0

  const kind = subsOn ? 'subtitled' : voiceOn ? 'voiceover' : 'plain'

  // ── build the compositor once every clip can render a frame ──
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
        clips: els.map((video, i) => ({ video, duration: trims[i] ?? fullLength })),
        voice: voiceRef.current,
        cues: null,
        onTick: setT,
        onEnd: () => setPlaying(false),
      })
      compRef.current.setVoiceEnabled(voiceOn)
      setReady(true)
    })

    return () => {
      cancelled = true
      compRef.current?.destroy()
      compRef.current = null
    }
    // Deliberately not re-run for trims, the voice switch, the captions, or a
    // regenerated narration. Every one of those is applied to the live
    // compositor below.
    //
    // Rebuilding makes a new AudioContext, and an element can only ever be
    // bound to one — createMediaElementSource throws the second time. That is
    // exactly what regenerating the voiceover used to do: the url changed, this
    // effect tore the compositor down, the next export built a fresh context,
    // binding threw, the throw was swallowed, and the reel exported silently.
    // The element's src changes on its own; the audio node follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.multiframeId, clips.length])

  useEffect(() => { compRef.current?.setDurations(trims) }, [trims])
  useEffect(() => { compRef.current?.setVoiceEnabled(voiceOn) }, [voiceOn])
  useEffect(() => {
    compRef.current?.setCues(
      subsOn && canSubtitle ? buildCues(reel.voiceoverWords, { offset }) : null
    )
  }, [subsOn, canSubtitle, offset, reel.voiceoverWords])

  // Timing is cheap to change and worth keeping, but not worth a request per
  // pixel of slider travel.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => {
      saveTiming(reel.multiframeId, {
        voOffsetSeconds: offset,
        trims: trims.map((seconds, idx) => ({ idx: clips[idx].idx, seconds })),
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trims, offset, ready])

  function toggle() {
    const c = compRef.current
    if (!c) return
    if (c.isPlaying()) { c.pause(); setPlaying(false) } else { c.play(); setPlaying(true) }
  }

  async function onSaveScript() {
    setSavingScript(true)
    setError(null)
    try {
      await saveScript(reel.multiframeId, script.trim())
      await onRefresh?.()
    } catch (err) { setError(err.message) } finally { setSavingScript(false) }
  }

  async function onNarrate() {
    setNarrating(true)
    setError(null)
    try {
      await generateVoiceover(reel.multiframeId, { script: script.trim(), voice })
      await onRefresh?.()
      setVoiceOn(true)
      // The element is about to be handed a different file; rewind it and the
      // reel together so the new read starts where the picture does.
      compRef.current?.seek(0)
    } catch (err) { setError(err.message) } finally { setNarrating(false) }
  }

  async function record() {
    const c = compRef.current
    if (!c || recording) return
    setError(null)
    setRecording({ kind, pct: 0 })
    setPlaying(true)
    try {
      const blob = await c.exportReel({ onProgress: (pct) => setRecording({ kind, pct }) })
      await saveCut(reel.multiframeId, { kind, blob, durationSeconds: total })
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setRecording(null)
      setPlaying(false)
      c.seek(0)
    }
  }

  if (!clips.length) return null

  const voDur = reel.voiceoverDuration
  const overrun = voDur ? voDur + offset - total : 0

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 22, paddingTop: 18 }}>
      {/* ── the script and its voice ── */}
      <div className="row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <b>Voiceover script</b>
        <div className="row" style={{ gap: 8 }}>
          <select className="input" style={{ padding: '6px 8px', fontSize: 13, width: 'auto' }}
            value={voice} onChange={(e) => setVoice(e.target.value)} disabled={narrating}>
            {(voices || DEFAULT_VOICES).map((v) => (
              <option key={v.id} value={v.id}>{v.name} — {v.blurb}</option>
            ))}
          </select>
          {scriptDirty && (
            <button className="btn xs" disabled={savingScript} onClick={onSaveScript}>
              {savingScript ? 'Saving…' : 'Save script'}
            </button>
          )}
          <button className="btn primary sm" disabled={narrating || !script.trim()} onClick={onNarrate}>
            {narrating ? '✦ Reading…' : hasVoice ? '✦ Regenerate voice' : '✦ Generate voiceover'}
          </button>
        </div>
      </div>

      <textarea className="input mt-2" style={{ minHeight: 84, fontSize: 14, lineHeight: 1.6 }}
        value={script} onChange={(e) => setScript(e.target.value)} maxLength={3000}
        placeholder="The narration read over the whole reel…" />

      <div className="small muted mt-2">
        {hasVoice ? (
          <>
            Narration {voDur ? `${voDur.toFixed(1)}s` : 'ready'} · picture {total.toFixed(1)}s
            {voDur && Math.abs(overrun) > 0.4 && (
              <b style={{ color: overrun > 0 ? 'var(--hot, #e2725b)' : 'inherit' }}>
                {overrun > 0
                  ? ` — the voice runs ${overrun.toFixed(1)}s past the picture. Trim the script or hold scenes longer.`
                  : ` — ${Math.abs(overrun).toFixed(1)}s of picture after the voice ends.`}
              </b>
            )}
            {scriptDirty && <b> · script edited since this reading — regenerate to hear it.</b>}
          </>
        ) : (
          'No narration yet. The clips are silent on purpose — one voice runs over the whole reel.'
        )}
      </div>

      {/* ── preview and edit ── */}
      <div className="row mt-6" style={{ gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          {clips.map((s, i) => (
            <video key={s.idx} ref={(el) => { videoRefs.current[i] = el }} src={s.videoUrl}
              crossOrigin="anonymous" playsInline preload="auto" style={{ display: 'none' }} />
          ))}
          {/* Always mounted, with or without a narration to play.
              A MediaElementAudioSourceNode binds to the ELEMENT, once, for the
              life of an AudioContext — so the element has to exist before the
              compositor is built and must survive every regeneration. Mounting
              it conditionally meant the compositor was built with no audio node
              at all until a voice existed, and then rebuilt when one arrived. */}
          <audio
            ref={voiceRef}
            src={reel.voiceoverUrl || undefined}
            crossOrigin="anonymous"
            preload="auto"
            hidden
          />

          <canvas ref={canvasRef} width={REEL_W} height={REEL_H} onClick={toggle}
            style={{ width: 260, borderRadius: 14, display: 'block', border: '1px solid var(--line)',
                     cursor: ready ? 'pointer' : 'default', background: '#000' }} />

          <div className="row between mt-2" style={{ width: 260 }}>
            <button className="btn xs" disabled={!ready || !!recording} onClick={toggle}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <span className="small muted">{ready ? `${t.toFixed(1)}s / ${total.toFixed(1)}s` : 'loading…'}</span>
          </div>
          <input type="range" min="0" max={total} step="0.05" value={Math.min(t, total)}
            disabled={!ready || !!recording}
            onChange={(e) => compRef.current?.seek(parseFloat(e.target.value))}
            style={{ width: 260, marginTop: 8 }} />
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <b className="small">What goes in the recording</b>
          <div className="row mt-2" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn sm ${voiceOn ? 'primary' : ''}`} disabled={!hasVoice}
              onClick={() => { const n = !voiceOn; setVoiceOn(n); if (!n) setSubsOn(false) }}>
              {voiceOn ? '✓ Voiceover' : 'Voiceover'}
            </button>
            <button className={`btn sm ${subsOn ? 'primary' : ''}`} disabled={!canSubtitle}
              onClick={() => { const n = !subsOn; setSubsOn(n); if (n) setVoiceOn(true) }}>
              {subsOn ? '✓ Subtitles' : 'Subtitles'}
            </button>
            <span className="chip accent">saves as “{CUT_LABEL[kind]}”</span>
          </div>
          {!hasVoice && <div className="small muted mt-2">Generate the voiceover to enable these.</div>}

          <div className="mt-6">
            <b className="small">How long each scene is held</b>
            {clips.map((s, i) => (
              <div key={s.idx} className="row" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
                <span className="small muted" style={{ width: 54 }}>Scene {s.idx + 1}</span>
                <input type="range" min="0.5" max={fullLength} step="0.1" value={trims[i]}
                  disabled={!!recording}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setTrims((prev) => prev.map((d, j) => (j === i ? v : d)))
                  }}
                  style={{ flex: 1 }} />
                <span className="small muted" style={{ width: 38, textAlign: 'right' }}>{trims[i].toFixed(1)}s</span>
              </div>
            ))}
            <div className="row mt-2" style={{ gap: 8 }}>
              <button className="btn ghost xs" disabled={!!recording}
                onClick={() => setTrims(clips.map(() => fullLength))}>Reset to full length</button>
            </div>
          </div>

          {hasVoice && (
            <div className="mt-6">
              <b className="small">When the voice comes in</b>
              <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
                <input type="range" min="0" max="8" step="0.1" value={offset} disabled={!!recording}
                  onChange={(e) => setOffset(parseFloat(e.target.value))} style={{ flex: 1 }} />
                <span className="small muted" style={{ width: 46, textAlign: 'right' }}>+{offset.toFixed(1)}s</span>
              </div>
            </div>
          )}

          <div className="row between mt-6" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span className="small muted">
              Recorded in real time — about {Math.ceil(total)}s, with this tab in front. Saves as MP4.
            </span>
            <button className="btn primary" disabled={!ready || !!recording} onClick={record}>
              {recording ? `⏺ Recording… ${recording.pct}%` : `⏺ Render “${CUT_LABEL[kind]}”`}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card mt-4" style={{ borderColor: 'rgba(226,114,91,0.4)' }}>
          <div className="row"><span className="chip hot">error</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      {/* ── every version, kept ── */}
      <div className="mt-6">
        <b className="small">Your versions</b>
        <div className="grid cols-3 stack-sm mt-2" style={{ gap: 10 }}>
          {['plain', 'voiceover', 'subtitled'].map((k) => {
            const cut = (reel.cuts || []).find((c) => c.kind === k)
            return (
              <div key={k} className="card" style={{ padding: 12 }}>
                <div className="row between">
                  <b className="small">{CUT_LABEL[k]}</b>
                  {cut ? <span className="chip brand">saved</span> : <span className="chip">not made</span>}
                </div>
                {cut ? (
                  <>
                    <video src={cut.url} controls preload="metadata"
                      style={{ width: '100%', borderRadius: 8, marginTop: 8, background: '#000' }} />
                    <DownloadButton
                      className="btn xs mt-2"
                      url={cut.url}
                      filename={`${slug(reel.name || 'reel')}-${k}.${extFromUrl(cut.url)}`}
                    />
                  </>
                ) : (
                  <div className="small muted mt-2">
                    {k === 'plain' && 'The clips joined, no sound.'}
                    {k === 'voiceover' && 'The join with the narration over it.'}
                    {k === 'subtitled' && 'The narrated cut with captions burned in.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Fallback if /options has not been read yet; the server is the real list, and
// every name in it was verified against the model rather than remembered.
const DEFAULT_VOICES = [
  { id: 'Rachel', name: 'Rachel', blurb: 'warm, conversational' },
  { id: 'Sarah', name: 'Sarah', blurb: 'soft and friendly' },
  { id: 'Aria', name: 'Aria', blurb: 'bright and expressive' },
  { id: 'Charlotte', name: 'Charlotte', blurb: 'calm and measured' },
  { id: 'Adam', name: 'Adam', blurb: 'low, steady, male' },
  { id: 'Brian', name: 'Brian', blurb: 'deep and reassuring' },
  { id: 'Liam', name: 'Liam', blurb: 'casual young male' },
  { id: 'Will', name: 'Will', blurb: 'easy, upbeat male' },
]

/**
 * The extension the stored cut actually has.
 *
 * Read off the path rather than assumed: a reel recorded in Chrome is mp4 and
 * one recorded in Firefox is webm, and the download has to be named for the
 * bytes rather than for whichever the code was written on.
 */
function extFromUrl(url) {
  const m = /\.(mp4|webm)(\?|$)/i.exec(String(url || ''))
  return m ? m[1].toLowerCase() : 'mp4'
}

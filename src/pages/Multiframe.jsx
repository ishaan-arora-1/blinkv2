import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import Upsell from '../components/Upsell.jsx'
import {
  SCENE_COUNT,
  MAX_IDEA,
  DURATIONS,
  SCENE_LABEL,
  startReel,
  awaitReel,
  fetchUsage,
} from '../lib/multiframe.js'
import ReelPlayer from '../components/ReelPlayer.jsx'

/**
 * Multiframe: one idea becomes a several-shot reel.
 *
 * The page is a straight line — write the idea, watch the shots arrive, play
 * the result — because the pipeline behind it is long enough that anything
 * cleverer would be hiding progress rather than presenting it. The scene strip
 * is the important part: frames land about a minute before the first clip does,
 * and seeing them is what tells someone the split understood what they asked
 * for, early enough to stop and rewrite rather than wait out a reel they do not
 * want.
 */
export default function Multiframe() {
  const store = useStore()
  const { can } = useAuth()

  const [idea, setIdea] = useState('')
  const [sceneCount, setSceneCount] = useState(SCENE_COUNT.default)
  const [duration, setDuration] = useState(8)
  const [aspect, setAspect] = useState('9:16')
  const [resolution, setResolution] = useState('720p')

  const [busy, setBusy] = useState(false)
  const [reel, setReel] = useState(null)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState(null)

  const abortRef = useRef(null)

  // Leaving the page must not leave a poll running.
  useEffect(() => () => abortRef.current?.abort(), [])

  // The month's allowance, re-read whenever a reel settles so the count
  // reflects what was just spent.
  useEffect(() => {
    if (!can.multiframe) return
    let live = true
    fetchUsage()
      .then((u) => live && setUsage(u))
      .catch(() => {})
    return () => { live = false }
  }, [can.multiframe, reel?.status])

  const brandId = store.state.brand?.id || null
  const affordable = usage ? usage.remaining >= sceneCount : true
  const totalSeconds = sceneCount * duration

  async function run() {
    if (!idea.trim() || busy) return
    setBusy(true)
    setError(null)
    setReel(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const { multiframeId } = await startReel({
        idea: idea.trim(),
        sceneCount,
        brandId,
        options: { durationSeconds: duration, aspectRatio: aspect, resolution },
      })

      const done = await awaitReel(multiframeId, { onUpdate: setReel, signal: ctrl.signal })
      setReel(done)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ── gated ────────────────────────────────────────────────────────────────
  if (!can.multiframe) {
    return (
      <div>
        <Head />
        <Upsell
          feature="multiframe"
          pitch="One idea becomes a whole reel: we break it into shots, draw the opening frame of each, film every one with generated audio, write the voiceover, and play them back as a single video you can export. Scenes come out of the same monthly video allowance as Blink AI."
        />
      </div>
    )
  }

  return (
    <div>
      <Head />

      {/* ── composer ── */}
      <div className="card" style={{ maxWidth: 780, padding: 22 }}>
        <textarea
          className="input"
          style={{ minHeight: 96, fontSize: 16, border: 'none', background: 'transparent', padding: 0, resize: 'none' }}
          placeholder="A morning routine reel where someone discovers the app, uses it on the train, and recommends it to a friend…"
          value={idea}
          maxLength={MAX_IDEA}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
          disabled={busy}
        />

        <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 18, paddingTop: 16 }}>
          <div className="grid cols-3 stack-sm" style={{ gap: 18 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Scenes</label>
              <div className="seg">
                {counts().map((n) => (
                  <button key={n} className={sceneCount === n ? 'on' : ''} disabled={busy} onClick={() => setSceneCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Each scene</label>
              <div className="seg">
                {DURATIONS.map((d) => (
                  <button key={d} className={duration === d ? 'on' : ''} disabled={busy} onClick={() => setDuration(d)}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Resolution</label>
              <div className="seg">
                {['720p', '1080p'].map((r) => (
                  <button key={r} className={resolution === r ? 'on' : ''} disabled={busy} onClick={() => setResolution(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field mt-4" style={{ marginBottom: 0 }}>
            <label>Aspect ratio</label>
            <div className="seg">
              {['9:16', '16:9'].map((a) => (
                <button key={a} className={aspect === a ? 'on' : ''} disabled={busy} onClick={() => setAspect(a)}>
                  {a === '9:16' ? '9:16 vertical' : '16:9 wide'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="row between mt-4" style={{ alignItems: 'flex-end' }}>
          <div className="small muted">
            {sceneCount} scenes × {duration}s — a {totalSeconds}-second reel.
            {' '}Costs {sceneCount} of your monthly videos.
            {usage && (
              <>
                {' '}
                <b style={{ color: affordable ? 'inherit' : 'var(--hot, #e2725b)' }}>
                  {usage.remaining} of {usage.limit} left this month
                </b>
                {!affordable && ' — pick fewer scenes.'}
              </>
            )}
          </div>
          <button className="btn primary" disabled={!idea.trim() || busy || !affordable} onClick={run}>
            {busy ? '✦ Working…' : '✦ Make the reel'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mt-6" style={{ maxWidth: 780 }}>
          <div className="row"><span className="chip hot">error</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      {reel && (
        <Progress reel={reel} busy={busy} onStopWatching={() => abortRef.current?.abort()} />
      )}

      {reel?.status === 'ready' && <ReelPlayer reel={reel} />}
    </div>
  )
}

function Head() {
  return (
    <div className="page-head">
      <div className="page-kicker">Multiframe</div>
      <h1 className="page-title">One idea, a whole <em>reel</em></h1>
      <p className="page-sub">
        Describe the video. We break it into scenes, draw the opening frame of each, film every one,
        and write the voiceover — then play them back as a single video.
      </p>
    </div>
  )
}

/**
 * The scene strip.
 *
 * Every scene shows its own state rather than the reel showing one bar, because
 * the states are genuinely different work — a frame is a few seconds and a clip
 * is a minute or two — and a single bar sitting at "2 of 4" says nothing about
 * whether the thing is progressing or wedged.
 */
function Progress({ reel, busy, onStopWatching }) {
  const scenes = reel.scenes || []
  const planning = reel.status === 'scripting' || !scenes.length

  return (
    <div className="card mt-6" style={{ maxWidth: 780 }}>
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <span className="tick" style={{ fontSize: 22 }}>✦</span>
          <div>
            <b>{planning ? 'Planning your scenes…' : `${reel.ready} of ${reel.total} scenes filmed`}</b>
            <div className="small muted">
              {busy
                ? 'A reel takes a few minutes. You can leave this page — it keeps rendering.'
                : 'Rendering continues in the background.'}
            </div>
          </div>
        </div>
        {busy && <button className="btn ghost xs" onClick={onStopWatching}>Stop watching</button>}
      </div>

      {reel.error && reel.status === 'ready' && (
        <div className="small mt-4" style={{ color: 'var(--hot, #e2725b)' }}>{reel.error}</div>
      )}

      {scenes.length > 0 && (
        <div className="grid cols-4 stack-sm mt-4" style={{ gap: 12 }}>
          {scenes.map((s) => (
            <div key={s.idx} className="tile" style={{ overflow: 'hidden' }}>
              <div style={{ aspectRatio: '9/16', background: '#0d0f0e', position: 'relative' }}>
                {s.videoUrl ? (
                  <video src={s.videoUrl} muted loop playsInline preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : s.frameUrl ? (
                  <img src={s.frameUrl} alt={`Scene ${s.idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />
                ) : null}
                <span className={`chip ${s.status === 'ready' ? 'brand' : s.status === 'failed' ? 'hot' : 'accent'}`}
                  style={{ position: 'absolute', left: 8, top: 8 }}>
                  {SCENE_LABEL[s.status] || s.status}
                </span>
              </div>
              <div className="tile-body" style={{ padding: '8px 10px' }}>
                <div className="small muted" style={{ minHeight: 32 }}>
                  {s.error || s.description || `Scene ${s.idx + 1}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function counts() {
  const out = []
  for (let n = SCENE_COUNT.min; n <= SCENE_COUNT.max; n++) out.push(n)
  return out
}

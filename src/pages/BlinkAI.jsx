import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import Upsell from '../components/Upsell.jsx'
import {
  SCENE_COUNT,
  MAX_IDEA,
  DURATIONS,
  startReel,
  awaitReel,
  startVideos,
  redrawFrame,
  checkStatus,
  fetchUsage,
  fetchOptions,
  listReels,
  fmtSeconds,
} from '../lib/multiframe.js'
import { go } from '../lib/router.js'
import ReelPlayer from '../components/ReelPlayer.jsx'
import ReelHistory from '../components/ReelHistory.jsx'
import SceneCard from '../components/SceneCard.jsx'

/**
 * Blink AI: one idea becomes a several-shot reel.
 *
 * Two modes behind one route. With nothing open it is a composer; with a reel
 * open it is that reel, and the marketing copy and the settings are gone —
 * what someone wants to see when they come back to a render is their own words
 * and the work, not the form they already filled in.
 *
 * Every reel has its own URL, which is what makes one worth leaving. A render
 * runs for minutes on the server, and the history dropdown plus /blink/:id mean
 * you can start one, go elsewhere, and pick it up mid-flight.
 *
 * The page is otherwise a straight line — write the idea, watch the shots
 * arrive, finish the video — because the pipeline behind it is long enough that
 * anything cleverer would be hiding progress rather than presenting it. The strip
 * is the important part: frames land about a minute before the first clip does,
 * and seeing them is what tells someone the split understood what they asked
 * for, early enough to stop and rewrite rather than wait out a reel they do not
 * want.
 */
export default function BlinkAI({ reelId }) {
  const store = useStore()
  const { can } = useAuth()

  // ── history ──
  const [reels, setReels] = useState([])

  // ── the reel currently open, if any ──
  const [reel, setReel] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── the composer, only used when nothing is open ──
  const [idea, setIdea] = useState('')
  const [sceneCount, setSceneCount] = useState(SCENE_COUNT.default)
  const [duration, setDuration] = useState(8)
  const [aspect, setAspect] = useState('9:16')
  const [resolution, setResolution] = useState('720p')
  const [product, setProduct] = useState(null)
  const [productURL, setProductURL] = useState(null)
  const fileRef = useRef(null)

  const [busy, setBusy] = useState(false)
  const [filming, setFilming] = useState(false)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState(null)
  const [voices, setVoices] = useState(null)

  const abortRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => () => { if (productURL) URL.revokeObjectURL(productURL) }, [productURL])

  const refreshHistory = React.useCallback(async () => {
    try {
      setReels(await listReels())
    } catch {
      // The dropdown is a convenience; failing to read it must not take the
      // page down with it.
    }
  }, [])

  useEffect(() => { if (can.multiframe) refreshHistory() }, [can.multiframe, refreshHistory])

  useEffect(() => {
    if (!can.multiframe) return
    let live = true
    fetchOptions().then((o) => live && setVoices(o.voices || null)).catch(() => {})
    return () => { live = false }
  }, [can.multiframe])

  useEffect(() => {
    if (!can.multiframe) return
    let live = true
    fetchUsage().then((u) => live && setUsage(u)).catch(() => {})
    return () => { live = false }
  }, [can.multiframe, reel?.status])

  // Opening a reel from its own URL. This is what makes one worth leaving:
  // the render continues on the server, and coming back picks it up wherever
  // it got to rather than starting again.
  useEffect(() => {
    abortRef.current?.abort()
    setError(null)

    if (!reelId) {
      setReel(null)
      return
    }

    let live = true
    setLoading(true)
    ;(async () => {
      try {
        const r = await checkStatus(reelId)
        if (!live) return
        setReel(r)
        if (r.status === 'pending' || r.status === 'scripting') watch(reelId, ['frames_ready', 'ready'])
        else if (r.status === 'rendering') watch(reelId, ['ready'])
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    })()

    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelId])

  /** Follow a reel until it reaches one of `until`, refreshing the list as it goes. */
  async function watch(id, until) {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const busySetter = until.includes('ready') && !until.includes('frames_ready') ? setFilming : setBusy
    busySetter(true)
    try {
      const done = await awaitReel(id, { onUpdate: setReel, signal: ctrl.signal, until })
      setReel(done)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      busySetter(false)
      refreshHistory()
    }
  }

  async function refresh() {
    try {
      setReel(await checkStatus(reel.multiframeId))
    } catch (err) {
      setError(err.message)
    }
  }

  const brandId = store.state.brand?.id || null
  const totalSeconds = sceneCount * duration
  // The allowance is spent in seconds of finished video, so what a reel costs
  // is its runtime — not how many scenes it happens to be cut into.
  const affordable = usage ? usage.remainingSeconds >= totalSeconds : true

  async function run() {
    if (!idea.trim() || busy) return
    setBusy(true)
    setError(null)

    try {
      const { multiframeId } = await startReel({
        idea: idea.trim(),
        sceneCount,
        brandId,
        productFile: product,
        options: { durationSeconds: duration, aspectRatio: aspect, resolution },
      })

      // In the list before anything has rendered, so it can be left immediately.
      await refreshHistory()
      setIdea('')
      setProduct(null)
      setProductURL(null)
      // The route change is what loads and starts watching it.
      go(`/blink/${multiframeId}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function film() {
    if (!reel || filming) return
    setFilming(true)
    setError(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await startVideos(reel.multiframeId)
      const done = await awaitReel(reel.multiframeId, { onUpdate: setReel, signal: ctrl.signal, until: ['ready'] })
      setReel(done)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setFilming(false)
      refreshHistory()
    }
  }

  async function editFrame(idx, instruction) {
    setError(null)
    setReel((r) => ({ ...r, scenes: r.scenes.map((sc) => (sc.idx === idx ? { ...sc, status: 'framing' } : sc)) }))
    try {
      const next = await redrawFrame(reel.multiframeId, idx, instruction)
      setReel((r) => ({
        ...r,
        scenes: r.scenes.map((sc) =>
          sc.idx === idx
            ? { ...sc, status: 'frame_ready', frameUrl: next.frameUrl, revisions: next.revisions, error: null }
            : sc
        ),
      }))
    } catch (err) {
      setError(err.message)
      setReel((r) => ({ ...r, scenes: r.scenes.map((sc) => (sc.idx === idx ? { ...sc, status: 'frame_ready' } : sc)) }))
    }
  }

  // ── gated ────────────────────────────────────────────────────────────────
  if (!can.multiframe) {
    return (
      <div>
        <div className="page-head">
          <div className="page-kicker">Blink AI</div>
          <h1 className="page-title">One idea, a whole <em>reel</em></h1>
          <p className="page-sub">
            Describe the video. We break it into scenes, draw the opening frame of each, film every one,
            write the voiceover and cut them together.
          </p>
        </div>
        <Upsell
          feature="multiframe"
          pitch="One idea becomes a whole video: we break it into scenes, draw the opening frame of each, film every one, narrate it in a single voice and cut them together — with subtitles if you want them. Upload your product and it is held identical through every scene. Studio includes two minutes of finished video a month; Agency, six."
        />
      </div>
    )
  }

  const bar = (
    <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
      <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <a href="#/blink" style={{ textDecoration: 'none' }}>
          <b style={{ fontSize: 18 }}>✦ Blink AI</b>
        </a>
        {usage && (
          <span className="small muted">
            {fmtSeconds(usage.remainingSeconds)} of {fmtSeconds(usage.limitSeconds)} video left this month
          </span>
        )}
      </div>
      <ReelHistory
        reels={reels}
        activeId={reel?.multiframeId || reelId || null}
        onNew={() => go('/blink')}
        onChanged={refreshHistory}
      />
    </div>
  )

  // ── an open reel: their prompt, then the work ────────────────────────────
  if (reelId) {
    return (
      <div>
        {bar}

        {loading && !reel ? (
          <div className="empty">Opening…</div>
        ) : reel ? (
          <>
            <div className="card" style={{ maxWidth: 900, padding: 18 }}>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>You asked for</div>
                  <div style={{ fontSize: 16, lineHeight: 1.5 }}>{reel.idea}</div>
                </div>
                <span className="chip">{reel.total} scenes · {reel.durationSeconds}s each</span>
              </div>
            </div>

            {error && (
              <div className="card mt-4" style={{ maxWidth: 900, borderColor: 'rgba(226,114,91,0.4)' }}>
                <div className="row"><span className="chip hot">error</span></div>
                <div className="small mt-2">{error}</div>
              </div>
            )}

            <Progress
              reel={reel}
              busy={busy}
              filming={filming}
              usage={usage}
              onFilm={film}
              onEditFrame={editFrame}
              onStopWatching={() => abortRef.current?.abort()}
            />

            {reel.status === 'ready' && <ReelPlayer reel={reel} voices={voices} onRefresh={refresh} />}
          </>
        ) : (
          <div className="empty">
            That reel could not be opened. <a href="#/blink" style={{ color: 'var(--brand)' }}>Start a new one</a>.
          </div>
        )}
      </div>
    )
  }

  // ── nothing open: the composer ───────────────────────────────────────────
  return (
    <div>
      {bar}

      <div className="page-head">
        <h1 className="page-title">One idea, a whole <em>reel</em></h1>
        <p className="page-sub">
          Describe the video. We break it into scenes, draw the opening frame of each, film every one,
          write the voiceover and cut them together.
        </p>
      </div>

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

        <div className="row wrap mt-4" style={{ gap: 10, alignItems: 'center' }}>
          {productURL ? (
            <>
              <img src={productURL} alt="your product"
                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }} />
              <span className="chip accent">held through every scene</span>
              <button className="btn xs" disabled={busy} onClick={() => fileRef.current?.click()}>Change</button>
              <button className="btn xs" disabled={busy} onClick={() => { setProduct(null); setProductURL(null) }}>Remove</button>
            </>
          ) : (
            <>
              <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>⬆ Upload your product</button>
              <span className="small muted">Optional. Add it and the same object appears in every scene, unchanged.</span>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setProduct(f); setProductURL(URL.createObjectURL(f)) }
              e.target.value = ''
            }} />
        </div>

        <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 18, paddingTop: 16 }}>
          <div className="grid cols-3 stack-sm" style={{ gap: 18 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Scenes</label>
              <div className="seg">
                {counts().map((n) => (
                  <button key={n} className={sceneCount === n ? 'on' : ''} disabled={busy} onClick={() => setSceneCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Each scene</label>
              <div className="seg">
                {DURATIONS.map((d) => (
                  <button key={d} className={duration === d ? 'on' : ''} disabled={busy} onClick={() => setDuration(d)}>{d}s</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Resolution</label>
              <div className="seg">
                {['720p', '1080p'].map((r) => (
                  <button key={r} className={resolution === r ? 'on' : ''} disabled={busy} onClick={() => setResolution(r)}>{r}</button>
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
            {sceneCount} scenes × {duration}s — a {totalSeconds}-second reel, which is {fmtSeconds(totalSeconds)} of your
            monthly video when you film it.
            {usage && !affordable && (
              <b style={{ color: 'var(--hot, #e2725b)' }}> You have {fmtSeconds(usage.remainingSeconds)} left — try fewer or shorter scenes.</b>
            )}
          </div>
          <button className="btn primary" disabled={!idea.trim() || busy || !affordable} onClick={run}>
            {busy ? '✦ Starting…' : '✦ Make the reel'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mt-6" style={{ maxWidth: 780 }}>
          <div className="row"><span className="chip hot">error</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}
    </div>
  )
}

/**
 * The scene board: what has been drawn, and what has been filmed.
 *
 * Every scene shows its own state rather than the reel showing one bar, because
 * the states are genuinely different work — a frame is a few seconds and a clip
 * is a minute or two — and a single bar sitting at "2 of 4" says nothing about
 * whether the thing is progressing or wedged.
 *
 * The board is also where filming is authorised. It stops here on purpose: the
 * frames are cheap and arrive first, and they are the evidence for whether the
 * scenes are worth the clips. Nothing is charged to the month's allowance until
 * the button below is pressed.
 */
function Progress({ reel, busy, filming, usage, onFilm, onEditFrame, onStopWatching }) {
  const scenes = reel.scenes || []
  const planning = reel.status === 'scripting' || !scenes.length
  const awaitingGo = reel.status === 'frames_ready'
  const drawing = scenes.some((s) => s.status === 'framing')

  const filmable = scenes.filter((s) => s.frameUrl && s.status !== 'failed').length
  const wantedSeconds = filmable * (reel.durationSeconds || 8)
  const affordable = usage ? usage.remainingSeconds >= wantedSeconds : true

  const heading = planning
    ? 'Reading your product and planning the scenes…'
    : awaitingGo
      ? `${reel.framesReady ?? filmable} frames drawn — have a look before we film them`
      : reel.status === 'rendering'
        ? `${reel.ready} of ${reel.total} scenes filmed`
        : `${reel.ready} of ${reel.total} scenes filmed`

  return (
    <div className="card mt-6" style={{ maxWidth: 900 }}>
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <span className="tick" style={{ fontSize: 22 }}>✦</span>
          <div>
            <b>{heading}</b>
            <div className="small muted">
              {awaitingGo
                ? 'Nothing has been charged yet. Redraw any frame you do not like, then film them.'
                : busy || filming
                  ? 'This takes a few minutes. You can leave this page — it keeps rendering.'
                  : 'Rendering continues in the background.'}
            </div>
          </div>
        </div>
        {(busy || filming) && (
          <button className="btn ghost xs" onClick={onStopWatching}>Stop watching</button>
        )}
      </div>

      {reel.error && reel.status === 'ready' && (
        <div className="small mt-4" style={{ color: 'var(--hot, #e2725b)' }}>{reel.error}</div>
      )}

      {scenes.length > 0 && (
        <div className="grid cols-4 stack-sm mt-4" style={{ gap: 12 }}>
          {scenes.map((s) => (
            <SceneCard
              key={s.idx}
              scene={s}
              editable={awaitingGo}
              maxRevisions={reel.maxFrameRevisions ?? 6}
              onEdit={onEditFrame}
            />
          ))}
        </div>
      )}

      {awaitingGo && (
        <div className="row between mt-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div className="small muted">
            Filming {filmable} {filmable === 1 ? 'scene' : 'scenes'} spends {fmtSeconds(wantedSeconds)} of your monthly video.
            {usage && (
              <>
                {' '}
                <b style={{ color: affordable ? 'inherit' : 'var(--hot, #e2725b)' }}>
                  {fmtSeconds(usage.remainingSeconds)} of {fmtSeconds(usage.limitSeconds)} left
                </b>
                {!affordable && ' — not enough for all of them.'}
              </>
            )}
          </div>
          <button
            className="btn primary"
            disabled={!filmable || drawing || filming || !affordable}
            onClick={onFilm}
          >
            {filming ? '✦ Filming…' : drawing ? 'Waiting for the redraw…' : `▶ Generate videos (${filmable})`}
          </button>
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

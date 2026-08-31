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
  fetchUsage,
} from '../lib/multiframe.js'
import ReelPlayer from '../components/ReelPlayer.jsx'
import SceneCard from '../components/SceneCard.jsx'

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

  const [product, setProduct] = useState(null)
  const [productURL, setProductURL] = useState(null)
  const fileRef = useRef(null)

  const [busy, setBusy] = useState(false)
  const [filming, setFilming] = useState(false)
  const [reel, setReel] = useState(null)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState(null)

  const abortRef = useRef(null)

  // Leaving the page must not leave a poll running.
  useEffect(() => () => abortRef.current?.abort(), [])

  // The preview is an object URL, which stays allocated until it is revoked.
  useEffect(() => () => { if (productURL) URL.revokeObjectURL(productURL) }, [productURL])

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
        productFile: product,
        options: { durationSeconds: duration, aspectRatio: aspect, resolution },
      })

      // Stops when the frames are drawn. Filming is a separate decision, and
      // it is the one that costs the month's allowance.
      const done = await awaitReel(multiframeId, {
        onUpdate: setReel,
        signal: ctrl.signal,
        until: ['frames_ready', 'ready'],
      })
      setReel(done)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** Hand the finished frames to Veo. This is the step that spends credits. */
  async function film() {
    if (!reel || filming) return
    setFilming(true)
    setError(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      await startVideos(reel.multiframeId)
      const done = await awaitReel(reel.multiframeId, {
        onUpdate: setReel,
        signal: ctrl.signal,
        until: ['ready'],
      })
      setReel(done)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setFilming(false)
    }
  }

  /** Redraw one frame in place, leaving the rest of the reel alone. */
  async function editFrame(idx, instruction) {
    setError(null)
    setReel((r) => ({
      ...r,
      scenes: r.scenes.map((sc) => (sc.idx === idx ? { ...sc, status: 'framing' } : sc)),
    }))
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
      setReel((r) => ({
        ...r,
        scenes: r.scenes.map((sc) => (sc.idx === idx ? { ...sc, status: 'frame_ready' } : sc)),
      }))
    }
  }

  // ── gated ────────────────────────────────────────────────────────────────
  if (!can.multiframe) {
    return (
      <div>
        <Head />
        <Upsell
          feature="multiframe"
          pitch="One idea becomes a whole reel: we break it into shots, draw the opening frame of each, film every one with generated audio, write the voiceover, and play them back as a single video you can export. Upload your product and it is held identical through every scene. Scenes come out of the same monthly video allowance as Blink AI."
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

        {/* The product the ad is about. Optional — a reel can be written from the
            idea alone — but when it is supplied every frame is generated from
            this photograph, so the object in the video is the real one. */}
        <div className="row wrap mt-4" style={{ gap: 10, alignItems: 'center' }}>
          {productURL ? (
            <>
              <img
                src={productURL}
                alt="your product"
                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }}
              />
              <span className="chip accent">held through every scene</span>
              <button className="btn xs" disabled={busy} onClick={() => fileRef.current?.click()}>Change</button>
              <button
                className="btn xs"
                disabled={busy}
                onClick={() => { setProduct(null); setProductURL(null) }}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                ⬆ Upload your product
              </button>
              <span className="small muted">
                Optional. Add it and the same object appears in every scene, unchanged.
              </span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setProduct(f)
                setProductURL(URL.createObjectURL(f))
              }
              e.target.value = ''
            }}
          />
        </div>

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
        <Progress
          reel={reel}
          busy={busy}
          filming={filming}
          usage={usage}
          onFilm={film}
          onEditFrame={editFrame}
          onStopWatching={() => abortRef.current?.abort()}
        />
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
  const affordable = usage ? usage.remaining >= filmable : true

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
            Filming {filmable} {filmable === 1 ? 'scene' : 'scenes'} costs {filmable} of your monthly videos.
            {usage && (
              <>
                {' '}
                <b style={{ color: affordable ? 'inherit' : 'var(--hot, #e2725b)' }}>
                  {usage.remaining} of {usage.limit} left
                </b>
                {!affordable && ' — not enough to film them all.'}
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

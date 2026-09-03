import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useGraphEdges } from '../lib/graphEdges.js'
import {
  BRAND,
  BRIEF,
  SCENES,
  SCRIPT,
  NARRATOR,
  PEAKS,
  FINAL,
  frameSrc,
  clipSrc,
  chosenFrame,
  clock,
} from '../lib/reelStory.js'

/**
 * The pipeline as a thing to point a screen recorder at.
 *
 * Not a landing page section. There is no navigation, no sign-in, no copy to
 * read and nothing that needs the API or a session — the route is answered
 * before App checks any of those, so it renders in a browser that has never
 * seen this product.
 *
 * It plays itself. A recording that has to be scrolled by hand is a recording
 * with a hand in it: the mouse moves, the scroll stutters, and the cut has to
 * work around both. So the stages arrive on a timer, each edge draws itself
 * between them, and the page walks its own viewport down to whatever just
 * appeared. Press record, wait, stop.
 *
 * ?still=1 skips the animation and shows the finished graph, for a screenshot.
 */

// Read once. A fresh array here would remeasure the graph on every commit.
const STAGES = ['prompt', 'frames', 'clips', 'script', 'voice', 'final']

// When each stage lands, in milliseconds. The gaps are uneven on purpose: the
// two rows of five need longer to read than the single nodes under them, and
// the last beat is held back so the finished ad arrives as an answer rather
// than as one more item on a list.
const CUE = { prompt: 400, frames: 1900, clips: 3900, script: 6000, voice: 7500, final: 9200 }

export default function AdGraph() {
  const still = typeof window !== 'undefined' && /[?&]still=1/.test(window.location.search)
  const [shown, setShown] = useState(() => (still ? new Set(STAGES) : new Set()))
  const [running, setRunning] = useState(!still)
  const [run, setRun] = useState(0)
  const stageRefs = useRef({})

  const declare = useCallback((link) => {
    SCENES.forEach((s) => {
      link('prompt', `frame-${s.id}`)
      link(`frame-${s.id}`, `clip-${s.id}`)
      link(`clip-${s.id}`, 'script')
    })
    link('script', 'voice')
    link('voice', 'final')
  }, [])

  const { wrapRef, register, edges, size, remeasure } = useGraphEdges(declare)

  // ── the reveal ──
  useEffect(() => {
    if (still) return undefined

    setShown(new Set())
    const timers = STAGES.map((stage) =>
      setTimeout(() => {
        setShown((prev) => new Set(prev).add(stage))
        // Laying out a stage moves every box below it, and the edges are drawn
        // from boxes. Remeasure after the browser has placed it.
        requestAnimationFrame(remeasure)

        const el = stageRefs.current[stage]
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (stage === STAGES[STAGES.length - 1]) setRunning(false)
      }, CUE[stage])
    )

    return () => timers.forEach(clearTimeout)
  }, [run, still, remeasure])

  const replay = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setRunning(true)
    setRun((n) => n + 1)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') replay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replay])

  const on = (stage) => (shown.has(stage) ? ' on' : '')
  const hold = (stage) => (el) => {
    if (el) stageRefs.current[stage] = el
    else delete stageRefs.current[stage]
  }

  return (
    <div className="ad">
      <div className="ad-graph" ref={wrapRef}>
        <svg
          className="ad-edges"
          viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
          width={size.w || undefined}
          height={size.h || undefined}
          aria-hidden="true"
        >
          {edges.map((e) => {
            // An edge belongs to the stage it arrives at, so it draws itself in
            // as that stage lands rather than before there is anything there.
            const to = e.key.split('>')[1]
            const stage = to.startsWith('frame-') ? 'frames' : to.startsWith('clip-') ? 'clips' : to
            return (
              <path key={e.key} className={`ad-edge${on(stage)}`} d={e.d} pathLength="1" />
            )
          })}
        </svg>

        {/* ── the prompt ── */}
        <section className={`ad-stage${on('prompt')}`} ref={hold('prompt')}>
          <Label>the prompt</Label>
          <div className="ad-node ad-prompt" ref={register('prompt')}>
            <p>{BRIEF.idea}</p>
            <div className="ad-prompt-foot">
              <img src={BRAND.productImg} alt={`${BRAND.name} ${BRAND.product}`} />
              <span>
                {BRIEF.sceneCount} scenes · {BRIEF.aspectRatio}
              </span>
            </div>
          </div>
        </section>

        {/* ── five frames ── */}
        <section className={`ad-stage${on('frames')}`} ref={hold('frames')}>
          <Label>five frames, drawn</Label>
          <div className="ad-row">
            {SCENES.map((s, i) => (
              <figure className="ad-tile" key={s.id} style={{ '--i': i }}>
                <div className="ad-shot" ref={register(`frame-${s.id}`)}>
                  <img src={frameSrc(chosenFrame(s).id)} alt={s.title} />
                </div>
                <figcaption>{s.title}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ── the same five, filmed ── */}
        <section className={`ad-stage${on('clips')}`} ref={hold('clips')}>
          <Label>five videos, filmed</Label>
          <div className="ad-row">
            {SCENES.map((s, i) => (
              <figure className="ad-tile" key={s.id} style={{ '--i': i }}>
                <div className="ad-shot" ref={register(`clip-${s.id}`)}>
                  <Clip scene={s} live={shown.has('clips')} />
                  <span className="ad-secs">{Math.round(s.seconds)}s</span>
                </div>
              </figure>
            ))}
          </div>
        </section>

        {/* ── written ── */}
        <section className={`ad-stage${on('script')}`} ref={hold('script')}>
          <Label>the script, written</Label>
          <div className="ad-node ad-script" ref={register('script')}>
            <q>{SCRIPT}</q>
          </div>
        </section>

        {/* ── read aloud ── */}
        <section className={`ad-stage${on('voice')}`} ref={hold('voice')}>
          <Label>the voiceover, read</Label>
          <div className="ad-node ad-voice" ref={register('voice')}>
            <b>{NARRATOR}</b>
            <span className="ad-wave" aria-hidden="true">
              {PEAKS.map((p, i) => (
                <i key={i} style={{ height: `${Math.max(10, p * 100)}%`, '--i': i }} />
              ))}
            </span>
          </div>
        </section>

        {/* ── the answer ── */}
        <section className={`ad-stage${on('final')}`} ref={hold('final')}>
          <Label>the finished ad</Label>
          <div className="ad-node ad-final" ref={register('final')}>
            <Final live={shown.has('final')} />
            <span className="ad-final-tag">{clock(FINAL.seconds)} · subtitled</span>
          </div>
        </section>
      </div>

      {/* Out of the way while it plays, so the take has no chrome in it. */}
      {!running && !still && (
        <button className="ad-replay" type="button" onClick={replay}>
          ↻ replay
        </button>
      )}
    </div>
  )
}

function Label({ children }) {
  return <div className="ad-label">{children}</div>
}

/**
 * A clip that starts when its stage does.
 *
 * Held at `preload="none"` until then: six videos all fetching behind a graph
 * that has not revealed them yet is the one thing that would make the first
 * ten seconds of a take stutter.
 */
function Clip({ scene, live }) {
  const ref = useRef(null)
  const clip = clipSrc(chosenFrame(scene).id)

  useEffect(() => {
    const el = ref.current
    if (!el || !live) return
    el.preload = 'auto'
    el.play().catch(() => {})
  }, [live])

  return (
    <video ref={ref} src={clip.src} poster={clip.poster} muted loop playsInline preload="none" />
  )
}

/**
 * The finished ad, from the top.
 *
 * `currentTime = 0` on arrival matters here in a way it does not on the landing
 * page: this is a recording, and the ad has to open on its first frame however
 * long the take took to reach it.
 */
function Final({ live }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !live) return
    el.preload = 'auto'
    el.currentTime = 0
    el.play().catch(() => {})
  }, [live])

  return (
    <video
      ref={ref}
      src={FINAL.src}
      poster={FINAL.poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={`The finished ${BRAND.name} reel`}
    />
  )
}

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

// Read once, not rebuilt per render: passing a fresh array would remeasure the
// whole graph on every commit.
const AXIS_ANCHORS = ['prompt', 'final']

/**
 * One real generation, drawn as the graph it actually is.
 *
 * The section this replaces made its case in prose — seven stages, a paragraph
 * each — and the argument drowned in it. The pipeline is a graph: one prompt
 * fans out into frames, each frame becomes a clip, the clips converge with a
 * script and a voice into one video. Drawing it that way says the same thing in
 * a glance and leaves the pictures to do the selling.
 *
 * The edges are measured, not authored — see lib/graphEdges.js. Every node
 * registers its box and the curves are recomputed from those, which is what
 * lets the same markup be a left-to-right graph on a desktop and a
 * top-to-bottom one on a phone with no second set of paths.
 *
 * Scenes that were redrawn show every look at once, dealt out like a hand of
 * cards. That is the whole redraw feature stated without a sentence: one shot,
 * one room, four outfits, side by side where they can be compared.
 */
export default function ReelGraph() {
  const reduced = useReducedMotion()

  // The pipeline, named by node key. The axis anchors are the two ends of it:
  // on a phone the columns become rows and both land on the same centre line,
  // which is what tells the edges to run down the page instead of across it.
  const declare = useCallback((link) => {
    SCENES.forEach((s) => {
      link('prompt', `frame-${s.id}`)
      link(`frame-${s.id}`, `clip-${s.id}`)
      link(`clip-${s.id}`, 'cut')
    })
    link('script', 'cut')
    link('voice', 'cut')
    link('cut', 'final')
  }, [])

  const { wrapRef, register, edges, size } = useGraphEdges(declare, {
    axisAnchors: AXIS_ANCHORS,
  })

  return (
    <div className="rg-graph" ref={wrapRef}>
        <svg
          className="rg-edges"
          viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
          width={size.w || undefined}
          height={size.h || undefined}
          aria-hidden="true"
        >
          {edges.map((e) => (
            <path key={e.key} d={e.d} />
          ))}
        </svg>

        <Column label="the prompt">
          <Prompt innerRef={register('prompt')} />
        </Column>

        <Column label="the frames" note="drawn first, before anything films" rows={SCENES.length}>
          {SCENES.map((s) => (
            <FrameNode key={s.id} scene={s} innerRef={register(`frame-${s.id}`)} />
          ))}
        </Column>

        <Column label="the clips" rows={SCENES.length}>
          {SCENES.map((s) => (
            <ClipNode key={s.id} scene={s} reduced={reduced} innerRef={register(`clip-${s.id}`)} />
          ))}
        </Column>

        <Column label="the cut">
          <ScriptNode innerRef={register('script')} />
          <CutNode innerRef={register('cut')} />
          <VoiceNode innerRef={register('voice')} />
        </Column>

      <Column label="the ad">
        <FinalNode reduced={reduced} innerRef={register('final')} />
      </Column>
    </div>
  )
}

/**
 * A column of the graph.
 *
 * `display: contents` on the wrapper drops it out of the layout so the head and
 * the body land in the graph's own two rows — which is what puts every column
 * label on one line across the top instead of floating beside whatever its
 * column happens to be tall enough to reach.
 *
 * `rows` splits the body into that many equal rows, so the five frames and the
 * five clips sit at matching heights and each pair reads as one strand.
 */
function Column({ label, note, rows, children }) {
  return (
    <div className="rg-col">
      <div className="rg-col-head">
        {label}
        {note && <i>{note}</i>}
      </div>
      <div
        className={`rg-col-body${rows ? ' rg-rows' : ''}`}
        style={rows ? { gridTemplateRows: `repeat(${rows}, 1fr)` } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

function Prompt({ innerRef }) {
  return (
    <div className="rg-node rg-prompt" ref={innerRef}>
      <p>{BRIEF.idea}</p>
      <div className="rg-prompt-foot">
        <img src={BRAND.productImg} alt={`${BRAND.name} ${BRAND.product}`} loading="lazy" />
        <span>
          {BRIEF.sceneCount} scenes · {BRIEF.aspectRatio}
        </span>
      </div>
    </div>
  )
}

/**
 * Plays while it is on screen, and only then.
 *
 * The clips are the proof that the frames were filmed, so they have to move
 * without being asked — but five autoplaying videos at the top of a landing
 * page is a megabyte nobody scrolled far enough to want. The observer is what
 * buys both: `preload="none"` until the graph is nearly in view, then play.
 */
function useAutoPlay(reduced) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return undefined

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.preload = 'auto'
          el.play().catch(() => {})
        } else {
          el.pause()
        }
      },
      { rootMargin: '250px' }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  return ref
}

/** Whether this visitor has asked the system to stop moving things. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return reduced
}

/**
 * A scene's frame, and the looks it was redrawn into.
 *
 * The looks are dealt out overlapping rather than stacked or cross-faded. A
 * stack hides them, and a cross-fade shows them one at a time and asks the
 * reader to hold the last one in their head to see that only the clothes
 * changed. Side by side, that comparison is the picture.
 *
 * The instruction behind a look appears when you point at it, so the graph
 * carries the evidence without carrying four sentences of it.
 */
function FrameNode({ scene, innerRef }) {
  const [hovered, setHovered] = useState(null)
  const many = scene.frames.length > 1
  const shown = scene.frames.find((f) => f.id === hovered)

  return (
    <div className={`rg-frame${many ? ' many' : ''}`}>
      {/* The edges anchor to the pictures, not to the node, so the caption
          underneath never drags its end of the line off centre. */}
      <div className="rg-stack" ref={innerRef}>
        {scene.frames.map((f) => (
          <div
            className={`rg-card${f.chosen ? ' chosen' : ''}${f.id === hovered ? ' on' : ''}`}
            key={f.id}
            onMouseEnter={() => many && setHovered(f.id)}
            onMouseLeave={() => many && setHovered(null)}
          >
            <img src={frameSrc(f.id)} alt={f.chosen ? scene.title : ''} loading="lazy" />
          </div>
        ))}
        {many && <span className="rg-looks">{scene.frames.length} looks</span>}
      </div>

      <b>{scene.title}</b>
      {many && (
        <span className="rg-instruction">
          {shown ? shown.instruction || 'as first drawn' : 'one shot, redrawn'}
        </span>
      )}
    </div>
  )
}

function ClipNode({ scene, reduced, innerRef }) {
  const clip = clipSrc(chosenFrame(scene).id)
  const video = useAutoPlay(reduced)

  return (
    <div className="rg-clip" ref={innerRef}>
      <video
        ref={video}
        src={clip.src}
        poster={clip.poster}
        muted
        loop
        playsInline
        preload="none"
        controls={reduced}
        aria-label={`${scene.title}, filmed`}
      />
      <span className="rg-secs">{Math.round(scene.seconds)}s</span>
    </div>
  )
}

function ScriptNode({ innerRef }) {
  return (
    <div className="rg-node rg-script" ref={innerRef}>
      <span className="rg-pin">script</span>
      <q>{SCRIPT}</q>
    </div>
  )
}

function VoiceNode({ innerRef }) {
  return (
    <div className="rg-node rg-voice" ref={innerRef}>
      <span className="rg-pin">voice</span>
      <b>{NARRATOR}</b>
      {/* The finished cut's own loudness, so the gaps are the real pauses. */}
      <span className="rg-wave" aria-hidden="true">
        {PEAKS.map((p, i) => (
          <i key={i} style={{ height: `${Math.max(8, p * 100)}%` }} />
        ))}
      </span>
    </div>
  )
}

function CutNode({ innerRef }) {
  return (
    <div className="rg-node rg-cut" ref={innerRef}>
      <span className="rg-cut-mark" aria-hidden="true">
        ⧉
      </span>
      <b>joined</b>
      <span>{clock(FINAL.seconds)} · subtitled</span>
    </div>
  )
}

/**
 * The finished ad, playing.
 *
 * Muted, because no browser will autoplay sound and none should. The subtitles
 * are burned into the picture, so a silent loop still reads — and the button in
 * the corner is there for the half of visitors who want to hear the voiceover
 * the two nodes to the left are about.
 */
function FinalNode({ reduced, innerRef }) {
  const video = useAutoPlay(reduced)
  const [muted, setMuted] = useState(true)

  // React does not reliably reflect `muted` to the element, and an autoplaying
  // video that is not actually muted is one the browser refuses to start.
  useEffect(() => {
    if (video.current) video.current.muted = muted
  }, [muted, video])

  return (
    <div className="rg-node rg-final" ref={innerRef}>
      <video
        ref={video}
        src={FINAL.src}
        poster={FINAL.poster}
        muted
        loop
        playsInline
        preload="none"
        controls={reduced}
        aria-label={`The finished ${BRAND.name} reel`}
      />
      {!reduced && (
        <button
          type="button"
          className="rg-sound"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
        >
          {muted ? '🔇 sound' : '🔊 sound'}
        </button>
      )}
    </div>
  )
}

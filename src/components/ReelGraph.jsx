import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
 * One real generation, drawn as the graph it actually is.
 *
 * The section this replaces made its case in prose — seven stages, a paragraph
 * each — and the argument drowned in it. The pipeline is a graph: one prompt
 * fans out into frames, each frame becomes a clip, the clips converge with a
 * script and a voice into one video. Drawing it that way says the same thing in
 * a glance and leaves the pictures to do the selling.
 *
 * The edges are measured, not authored. Every node registers its box, and the
 * curves are recomputed from those boxes whenever the layout changes — which is
 * what lets the same markup be a left-to-right graph on a desktop and a
 * top-to-bottom one on a phone with no second set of paths.
 *
 * Scenes that were redrawn show every look at once, dealt out like a hand of
 * cards. That is the whole redraw feature stated without a sentence: one shot,
 * one room, four outfits, side by side where they can be compared.
 */
export default function ReelGraph() {
  const reduced = useReducedMotion()
  const wrapRef = useRef(null)
  const nodes = useRef({})
  const [edges, setEdges] = useState([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const register = useCallback((key) => (el) => {
    if (el) nodes.current[key] = el
    else delete nodes.current[key]
  }, [])

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const base = wrap.getBoundingClientRect()
    const box = (key) => {
      const el = nodes.current[key]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
    }

    // Which way the graph runs. On a phone the columns become rows and every
    // node ends up on the same centre line, so the axis is read off the layout
    // once rather than guessed per edge — a pair-by-pair guess sends the two
    // outermost frames' edges out sideways while the other three go down.
    const first = box('prompt')
    const last = box('final')
    const vertical = !first || !last || Math.abs(centre(last).x - centre(first).x) < 48

    const links = []
    const add = (from, to) => {
      const a = box(from)
      const b = box(to)
      if (a && b) links.push({ key: `${from}>${to}`, d: curve(a, b, vertical) })
    }

    SCENES.forEach((s) => {
      add('prompt', `frame-${s.id}`)
      add(`frame-${s.id}`, `clip-${s.id}`)
      add(`clip-${s.id}`, 'cut')
    })
    add('script', 'cut')
    add('voice', 'cut')
    add('cut', 'final')

    setEdges(links)
    setSize({ w: base.width, h: base.height })
  }, [])

  // Edges are drawn from measured boxes, so they have to be measured after
  // layout and again whenever it changes — a font swapping in, a column
  // wrapping, the window resizing.
  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    Object.values(nodes.current).forEach((el) => ro.observe(el))
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [measure])

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

const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/**
 * A cubic between two boxes, leaving one and entering the other along the axis
 * the graph runs on.
 *
 * Passing the axis in rather than deriving it per pair is what lets the same
 * markup be a left-to-right graph on a desktop and a top-to-bottom one on a
 * phone: one flag, one set of paths, no second layout to keep in step.
 */
function curve(a, b, vertical) {
  const ac = centre(a)
  const bc = centre(b)

  if (!vertical) {
    const x1 = ac.x < bc.x ? a.x + a.w : a.x
    const x2 = ac.x < bc.x ? b.x : b.x + b.w
    const bend = Math.max(20, Math.abs(x2 - x1) * 0.55)
    const dir = ac.x < bc.x ? 1 : -1
    return `M${x1},${ac.y} C${x1 + bend * dir},${ac.y} ${x2 - bend * dir},${bc.y} ${x2},${bc.y}`
  }

  const y1 = ac.y < bc.y ? a.y + a.h : a.y
  const y2 = ac.y < bc.y ? b.y : b.y + b.h
  const bend = Math.max(16, Math.abs(y2 - y1) * 0.55)
  const dir = ac.y < bc.y ? 1 : -1
  return `M${ac.x},${y1} C${ac.x},${y1 + bend * dir} ${bc.x},${y2 - bend * dir} ${bc.x},${y2}`
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

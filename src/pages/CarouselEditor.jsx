import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import JSZip from 'jszip'
import { useStore } from '../lib/store.jsx'
import { pickRandom } from '../lib/library.js'
import { resolveImage, useSetImages, displayThumb } from '../lib/useImages.js'
import { regenerateHook, buildPreset } from '../lib/copygen.js'
import { newTextLayer } from './Carousels.jsx'
import { uid } from '../lib/ids.js'

const STAGE_W = 380
const FONTS = { display: 'var(--display)', body: 'var(--body)', serif: 'var(--serif)' }
const ROLE_LABEL = { hook: 'Hook', body: 'Body', cta: 'CTA' }

const NO_SLIDES = []

function useResolvedBgs(slides = NO_SLIDES) {
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all(slides.map(async (s) => [s.id, await resolveImage(s.bg)])).then((pairs) => {
      if (alive) setMap(Object.fromEntries(pairs))
    })
    return () => { alive = false }
  }, [slides])
  return map
}

/**
 * How much the on-screen stage is shrunk from its design width.
 *
 * The stage is fluid below 380px, but the text layers are sized in px, so they
 * would grow relative to the slide on a narrow screen and the preview would
 * stop matching the export. Measuring the stage and scaling the type by the
 * same factor keeps the composition identical at any width.
 */
function useStageScale(ref) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setScale(w / STAGE_W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return scale
}

function TextLayer({ layer, selected, onSelect, onDrag, stageRef, scale = 1 }) {
  const start = useRef(null)

  function onPointerDown(e) {
    e.stopPropagation()
    onSelect(layer.id)
    const rect = stageRef.current.getBoundingClientRect()
    start.current = { rect }
    try { e.target.setPointerCapture?.(e.pointerId) } catch {}
  }
  function onPointerMove(e) {
    if (!start.current) return
    const { rect } = start.current
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    onDrag(layer.id, Math.max(2, Math.min(98, x)), Math.max(2, Math.min(98, y)))
  }
  function onPointerUp() { start.current = null }

  const pad = `${8 * scale}px ${16 * scale}px`
  const pillStyle = layer.pill === 'dark'
    ? { background: 'rgba(8,10,8,0.82)', padding: pad, borderRadius: 10 * scale }
    : layer.pill === 'accent'
      ? { background: 'var(--pill-accent, #c9a4ff)', padding: pad, borderRadius: 999 }
      : {}

  return (
    <div
      className={`txt ${selected ? 'selected' : ''}`}
      style={{
        left: `${layer.x}%`, top: `${layer.y}%`,
        width: `${layer.width}%`,
        fontSize: layer.size * scale,
        fontWeight: layer.weight,
        color: layer.color,
        textAlign: layer.align,
        fontFamily: FONTS[layer.font] || FONTS.body,
        textTransform: layer.upper ? 'uppercase' : 'none',
        lineHeight: 1.18,
        textShadow: layer.pill === 'none' ? '0 2px 14px rgba(0,0,0,0.45)' : 'none',
        letterSpacing: layer.font === 'display' ? '-0.01em' : '0',
        ...pillStyle,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {layer.text}
    </div>
  )
}

export default function CarouselEditor({ id }) {
  const store = useStore()
  const proj = store.state.carousels.find((c) => c.id === id)
  const [cur, setCur] = useState(0)
  const [selText, setSelText] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exporting, setExporting] = useState(null)
  const stageRef = useRef(null)
  const stageScale = useStageScale(stageRef)
  const bgs = useResolvedBgs(proj?.slides)

  if (!proj) return <div className="empty mt-6">Carousel not found. <a href="#/carousels" style={{ color: 'var(--brand)' }}>Back to carousels</a></div>

  const slide = proj.slides[Math.min(cur, proj.slides.length - 1)]
  const layer = slide.texts.find((t) => t.id === selText)
  const brand = store.state.brand

  function save(patch) { store.saveCarousel({ ...proj, ...patch }) }
  function updateSlide(slideId, patch) {
    save({ slides: proj.slides.map((s) => (s.id === slideId ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)) })
  }
  function updateLayer(layerId, patch) {
    updateSlide(slide.id, (s) => ({ texts: s.texts.map((t) => (t.id === layerId ? { ...t, ...patch } : t)) }))
  }

  // ── shuffle ──────────────────────────────────────────────
  function shuffleSlide(s) {
    const set = store.getSet(proj.setAssignment[s.role])
    if (!set || !set.images.length) return
    updateSlide(s.id, { bg: pickRandom(set.images, s.bg) })
  }
  function shuffleAll() {
    save({
      slides: proj.slides.map((s) => {
        const set = store.getSet(proj.setAssignment[s.role])
        return set?.images.length ? { ...s, bg: pickRandom(set.images, s.bg) } : s
      }),
    })
  }

  // ── slides ───────────────────────────────────────────────
  function addBodySlide() {
    const set = store.getSet(proj.setAssignment.body)
    const copy = buildPreset(brand, proj.presetId)
    const used = proj.slides.filter((x) => x.role === 'body').length
    const b = copy.bodies[used % copy.bodies.length]
    const s = {
      id: uid('s'), role: 'body', bg: pickRandom(set?.images || []), dim: 0.5,
      texts: [
        newTextLayer({ text: b.h, y: 42, size: 26, font: 'display', width: 84 }),
        newTextLayer({ text: b.s, y: 60, size: 15, weight: 500, color: '#e9e9e9', width: 74 }),
      ],
    }
    const ctaIdx = proj.slides.findIndex((x) => x.role === 'cta')
    const slides = [...proj.slides]
    slides.splice(ctaIdx === -1 ? slides.length : ctaIdx, 0, s)
    save({ slides })
    setCur(ctaIdx === -1 ? slides.length - 1 : ctaIdx)
  }
  function deleteSlide(s) {
    if (proj.slides.length <= 1) return
    const slides = proj.slides.filter((x) => x.id !== s.id)
    save({ slides })
    setCur(Math.max(0, cur - 1))
  }
  function moveSlide(s, dir) {
    const i = proj.slides.findIndex((x) => x.id === s.id)
    const j = i + dir
    if (j < 0 || j >= proj.slides.length) return
    const slides = [...proj.slides]
    ;[slides[i], slides[j]] = [slides[j], slides[i]]
    save({ slides })
    setCur(j)
  }

  // ── export ───────────────────────────────────────────────
  async function waitForBg(url) {
    if (!url) return
    await new Promise((res) => {
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = res; im.onerror = res
      im.src = url
    })
  }
  // Measured, not assumed: the stage is fluid on small screens, and a fixed
  // ratio there would export a slide narrower than 1080px.
  const exportRatio = () => 1080 / (stageRef.current?.offsetWidth || STAGE_W)

  async function captureCurrent() {
    await waitForBg(bgs[slide.id])
    await new Promise((r) => setTimeout(r, 150))
    return toPng(stageRef.current, { pixelRatio: exportRatio(), cacheBust: false })
  }
  async function exportCurrent() {
    setExporting('Rendering slide…')
    try {
      const png = await captureCurrent()
      downloadURL(png, `${slugify(proj.name)}-slide-${cur + 1}.png`)
    } finally { setExporting(null) }
  }
  async function exportAll() {
    const zip = new JSZip()
    const startIdx = cur
    try {
      for (let i = 0; i < proj.slides.length; i++) {
        setExporting(`Rendering slide ${i + 1} of ${proj.slides.length}…`)
        setCur(i)
        await new Promise((r) => setTimeout(r, 250))
        await waitForBg(bgs[proj.slides[i].id])
        const png = await toPng(stageRef.current, { pixelRatio: exportRatio(), cacheBust: false })
        zip.file(`${String(i + 1).padStart(2, '0')}-${proj.slides[i].role}.png`, png.split(',')[1], { base64: true })
      }
      setExporting('Zipping…')
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadURL(URL.createObjectURL(blob), `${slugify(proj.name)}-carousel.zip`)
    } finally {
      setExporting(null)
      setCur(startIdx)
    }
  }

  return (
    <div>
      <div className="row between editor-bar" style={{ marginBottom: 18 }}>
        <div className="row">
          <button className="btn ghost sm" onClick={() => (window.location.hash = '/carousels')}>← Back</button>
          <input
            className="input editor-name"
            value={proj.name} onChange={(e) => save({ name: e.target.value })}
          />
        </div>
        <div className="row">
          <button className="btn sm" onClick={shuffleAll}>⤨ Shuffle all backgrounds</button>
          <button className="btn sm" onClick={exportCurrent}>Export slide</button>
          <button className="btn primary sm" onClick={exportAll}>Export all · ZIP</button>
        </div>
      </div>

      <div className="editor-layout">
        {/* ── slide rail ── */}
        <div className="editor-rail">
          <div className="grid" style={{ gap: 10 }}>
            {proj.slides.map((s, i) => (
              <button
                key={s.id}
                className={`slide-thumb ${i === cur ? 'active' : ''}`}
                style={{ backgroundImage: bgs[s.id] ? `url(${bgs[s.id]})` : undefined }}
                onClick={() => { setCur(i); setSelText(null) }}
              >
                <span className="role-tag">{ROLE_LABEL[s.role]} {s.role === 'body' ? proj.slides.filter((x) => x.role === 'body').indexOf(s) + 1 : ''}</span>
              </button>
            ))}
            <button className="btn sm" onClick={addBodySlide}>+ Body slide</button>
          </div>
        </div>

        {/* ── stage ── */}
        <div className="stage-wrap">
          <div className="row" style={{ gap: 8 }}>
            <span className="chip brand">{ROLE_LABEL[slide.role]} slide</span>
            <span className="chip">{cur + 1} / {proj.slides.length}</span>
          </div>
          <div
            ref={stageRef}
            className="stage"
            style={{ backgroundImage: bgs[slide.id] ? `url(${bgs[slide.id]})` : undefined, '--pill-accent': brand.accent }}
            onPointerDown={() => setSelText(null)}
          >
            <div style={{ position: 'absolute', inset: 0, background: `rgba(6,8,6,${slide.dim})`, pointerEvents: 'none' }} />
            {slide.texts.map((t) => (
              <TextLayer
                key={t.id} layer={t} stageRef={stageRef} scale={stageScale}
                selected={t.id === selText}
                onSelect={setSelText}
                onDrag={(id2, x, y) => updateLayer(id2, { x, y })}
              />
            ))}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => shuffleSlide(slide)}>⤨ Shuffle background</button>
            <button className="btn sm" onClick={() => setPickerOpen(true)}>❖ Choose image / set</button>
            {slide.role === 'hook' && (
              <button className="btn sm" onClick={() => {
                const first = slide.texts[0]
                if (first) updateLayer(first.id, { text: regenerateHook(brand, proj.presetId) })
              }}>✦ Rewrite hook</button>
            )}
          </div>
        </div>

        {/* ── inspector ── */}
        <div className="inspector">
          <div className="card">
            <h4>Slide</h4>
            <div className="field mt-2">
              <label>Darken background — {Math.round(slide.dim * 100)}%</label>
              <input type="range" min="0" max="0.8" step="0.05" value={slide.dim}
                onChange={(e) => updateSlide(slide.id, { dim: parseFloat(e.target.value) })} />
            </div>
            <div className="row wrap">
              <button className="btn xs" onClick={() => moveSlide(slide, -1)}>↑ Move up</button>
              <button className="btn xs" onClick={() => moveSlide(slide, 1)}>↓ Move down</button>
              <button className="btn xs danger" onClick={() => deleteSlide(slide)}>Delete slide</button>
            </div>
          </div>

          <div className="card">
            <div className="row between">
              <h4>Text layers</h4>
              <button className="btn xs" onClick={() => {
                const t = newTextLayer({ text: 'New text', y: 75 })
                updateSlide(slide.id, (s) => ({ texts: [...s.texts, t] }))
                setSelText(t.id)
              }}>+ Add</button>
            </div>
            <div className="grid mt-2" style={{ gap: 6 }}>
              {slide.texts.map((t) => (
                <button key={t.id} className={`btn sm ${t.id === selText ? 'primary' : ''}`}
                  style={{ justifyContent: 'flex-start', overflow: 'hidden', whiteSpace: 'nowrap', borderRadius: 8 }}
                  onClick={() => setSelText(t.id)}>
                  {t.text.slice(0, 26) || '(empty)'}
                </button>
              ))}
            </div>
          </div>

          {layer && (
            <div className="card">
              <h4>Selected text</h4>
              <div className="field mt-2">
                <label>Content</label>
                <textarea className="input" value={layer.text} onChange={(e) => updateLayer(layer.id, { text: e.target.value })} />
              </div>
              <div className="field">
                <label>Size — {layer.size}px</label>
                <input type="range" min="9" max="64" value={layer.size} onChange={(e) => updateLayer(layer.id, { size: +e.target.value })} />
              </div>
              <div className="field">
                <label>Width — {layer.width}%</label>
                <input type="range" min="20" max="96" value={layer.width} onChange={(e) => updateLayer(layer.id, { width: +e.target.value })} />
              </div>
              <div className="field">
                <label>Font</label>
                <div className="seg">
                  {['display', 'body', 'serif'].map((f) => (
                    <button key={f} className={layer.font === f ? 'on' : ''} onClick={() => updateLayer(layer.id, { font: f })}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Weight</label>
                <div className="seg">
                  {[500, 700, 800].map((w) => (
                    <button key={w} className={layer.weight === w ? 'on' : ''} onClick={() => updateLayer(layer.id, { weight: w })}>{w}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Align</label>
                <div className="seg">
                  {['left', 'center', 'right'].map((a) => (
                    <button key={a} className={layer.align === a ? 'on' : ''} onClick={() => updateLayer(layer.id, { align: a })}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Background pill</label>
                <div className="seg">
                  {['none', 'dark', 'accent'].map((p) => (
                    <button key={p} className={layer.pill === p ? 'on' : ''} onClick={() => updateLayer(layer.id, { pill: p })}>{p}</button>
                  ))}
                </div>
              </div>
              <div className="row between">
                <div className="row">
                  <input type="color" value={layer.color} onChange={(e) => updateLayer(layer.id, { color: e.target.value })} />
                  <label className="row small muted" style={{ gap: 6 }}>
                    <input type="checkbox" checked={layer.upper} onChange={(e) => updateLayer(layer.id, { upper: e.target.checked })} />
                    UPPERCASE
                  </label>
                </div>
                <button className="btn xs danger" onClick={() => {
                  updateSlide(slide.id, (s) => ({ texts: s.texts.filter((t) => t.id !== layer.id) }))
                  setSelText(null)
                }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <ImagePicker
          store={store} proj={proj} slide={slide}
          onClose={() => setPickerOpen(false)}
          onAssignSet={(setId) => save({ setAssignment: { ...proj.setAssignment, [slide.role]: setId } })}
          onPick={(img) => { updateSlide(slide.id, { bg: img }); setPickerOpen(false) }}
          onShuffle={(setId) => {
            const set = store.getSet(setId)
            if (set?.images.length) updateSlide(slide.id, { bg: pickRandom(set.images, slide.bg) })
          }}
        />
      )}

      {exporting && (
        <div className="modal-veil">
          <div className="modal" style={{ width: 320, textAlign: 'center' }}>
            <div className="tick" style={{ fontSize: 30, marginBottom: 10 }}>✦</div>
            <b>{exporting}</b>
            <div className="small muted mt-2">1080 × 1350 — Instagram-ready</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImagePicker({ store, proj, slide, onClose, onAssignSet, onPick, onShuffle }) {
  const [setId, setSetId] = useState(proj.setAssignment[slide.role])
  const set = store.getSet(setId)
  const urls = useSetImages(set)
  const sets = store.allSets()

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>Backgrounds for the <span style={{ color: 'var(--brand)' }}>{slide.role}</span> section</h3>
            <div className="sub">Pick a set for this section, then shuffle within it or choose an exact image.</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="row wrap" style={{ marginBottom: 16 }}>
          {sets.map((s) => (
            <button key={s.id} className={`btn sm ${s.id === setId ? 'primary' : ''}`}
              onClick={() => { setSetId(s.id); onAssignSet(s.id) }}>
              {s.name}{!s.builtin && ' ◇'}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={() => onShuffle(setId)}>⤨ Shuffle from “{set?.name}”</button>
          <span className="small muted">{urls.length} images · applies to this slide</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
          {(set?.images || []).map((img, i) => (
            // The thumbnail is display-only — onPick still receives the original
            // reference, so the slide keeps its full-resolution background.
            <button key={i} className="img-cell" style={{ backgroundImage: `url("${displayThumb(urls[i])}")` }} onClick={() => onPick(img)} />
          ))}
          {urls.length === 0 && <div className="small muted" style={{ gridColumn: '1/-1' }}>This set has no images — upload some in Image Sets.</div>}
        </div>
      </div>
    </div>
  )
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carousel' }
function downloadURL(url, name) {
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}

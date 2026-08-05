import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { buildPreset, blankCopy, presetOptions } from '../lib/copygen.js'
import { pickRandom, suggestedSetId } from '../lib/library.js'
import { newId, uid } from '../lib/ids.js'
import { useSetImages, useResolvedImage, displayThumb } from '../lib/useImages.js'
import { CHARACTERS } from '../lib/characters.js'
import { startAnimated, waitForAnimated } from '../lib/animated.js'
import { lockReason } from '../lib/tiers.js'
import { go } from '../lib/router.js'

export function newTextLayer(patch) {
  return {
    id: uid('t'), text: 'Text', x: 50, y: 50, size: 24, weight: 800, color: '#ffffff',
    align: 'center', width: 82, font: 'body', upper: false, pill: 'none', ...patch,
  }
}

// Builds a carousel from a chosen image set + a chosen copy preset (or blank).
export function buildCarousel(store, setId, presetId) {
  const brand = store.state.brand
  const copy = presetId === 'blank' ? blankCopy(brand) : buildPreset(brand, presetId)
  const set = store.getSet(setId)
  const imgs = set?.images || []
  const assignment = { hook: setId, body: setId, cta: setId }

  const slides = []
  slides.push({
    id: uid('s'), role: 'hook', bg: pickRandom(imgs), dim: 0.5,
    texts: [
      newTextLayer({ text: copy.hook, y: 46, size: 30, font: 'display', width: 86 }),
      newTextLayer({ text: `@${(brand.appName || 'yourapp').toLowerCase().replace(/\s+/g, '')}`, y: 90, size: 13, weight: 500, font: 'body', color: '#e6e6e6' }),
      newTextLayer({ text: 'swipe →', y: 96, size: 11, weight: 500, color: '#cccccc' }),
    ],
  })
  copy.bodies.forEach((b, i) => {
    slides.push({
      id: uid('s'), role: 'body', bg: pickRandom(imgs), dim: 0.5,
      texts: [
        newTextLayer({ text: `0${i + 1}`, y: 26, size: 15, font: 'serif', color: brand.accent, weight: 500 }),
        newTextLayer({ text: b.h, y: 42, size: 26, font: 'display', width: 84 }),
        newTextLayer({ text: b.s, y: 60, size: 15, weight: 500, color: '#e9e9e9', width: 74 }),
      ],
    })
  })
  slides.push({
    id: uid('s'), role: 'cta', bg: pickRandom(imgs), dim: 0.45,
    texts: [
      newTextLayer({ text: copy.cta.h, y: 42, size: 28, font: 'display', width: 84 }),
      newTextLayer({ text: copy.cta.s, y: 58, size: 15, weight: 600, pill: 'accent', color: '#101010', width: 70 }),
    ],
  })

  return {
    // A row id, so it must be a real UUID. The slide and text-layer ids above
    // stay short — they only ever live inside the slides jsonb.
    id: newId(),
    name: copy.hook.length > 34 ? copy.hook.slice(0, 34) + '…' : copy.hook,
    createdAt: Date.now(),
    // Pinned at creation. Re-rolling a hook a month later has to use the brand
    // this was written for, not whichever one happens to be selected then.
    brandId: brand.id,
    presetId: copy.presetId,
    setAssignment: assignment,
    slides,
  }
}

function CarouselCard({ proj, store }) {
  // The slide's own background, resolved the same way the editor resolves it.
  // The previous version used proj.slides[0].bg raw whenever it was a string,
  // which silently broke every carousel built from the Gradient Studio set:
  // those refs are "gradient:N", not URLs, so the tile painted nothing at all.
  const hook = proj.slides[0]
  const slideBg = useResolvedImage(hook?.bg)

  // Only reached for a carousel whose slide has no background of its own.
  const set0 = store.getSet(proj.setAssignment?.hook)
  const fallback = useSetImages(set0)[0]
  const bg = slideBg || fallback

  return (
    <div className="tile" style={{ cursor: 'pointer' }} onClick={() => (window.location.hash = `/carousel/${proj.id}`)}>
      {/* 4:5 — the ratio these actually export at (1080 × 1350), so the crop in
          the preview is the crop the user will get. */}
      <div className="thumb-4x5" style={{ backgroundImage: bg ? `url("${bg}")` : undefined }}>
        <span className="chip brand">{proj.slides.length} slides</span>
      </div>
      <div className="tile-body">
        <div className="tile-title">{proj.name}</div>
        <div className="row between mt-2">
          <span className="tile-sub">{new Date(proj.createdAt).toLocaleDateString()}</span>
          <button className="btn xs danger" onClick={(e) => { e.stopPropagation(); if (confirm('Delete this carousel?')) store.deleteCarousel(proj.id) }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function Carousels() {
  const store = useStore()
  const { carousels } = store.state
  const [wizard, setWizard] = useState(false)

  return (
    <div>
      <div className="page-head row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker">Create</div>
          <h1 className="page-title">Photo <em>carousels</em></h1>
          <p className="page-sub">
            Pick a photo set, pick an angle, and get a full hook → body → CTA carousel.
            Everything stays editable.
          </p>
        </div>
        <button className="btn primary" onClick={() => setWizard(true)}>✦ Mint a carousel</button>
      </div>

      {carousels.length === 0 ? (
        <div className="empty">
          <div className="big">❏</div>
          <b>No carousels yet.</b>
          <div className="small mt-2">Hit “Mint a carousel” — choose a look, choose an angle, done.</div>
        </div>
      ) : (
        <div className="grid cols-3">
          {[...carousels].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
            <CarouselCard key={p.id} proj={p} store={store} />
          ))}
        </div>
      )}

      {wizard && <NewCarouselWizard store={store} onClose={() => setWizard(false)} />}
    </div>
  )
}

function SetTile({ set, selected, suggested, onSelect }) {
  const urls = useSetImages(set)
  return (
    <button className={`tile ${selected ? 'selected' : ''}`} onClick={onSelect}>
      {/* 4:5 overall, so each of the four cells is also 4:5 and the photos are
          cropped the way a slide would crop them. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, aspectRatio: '4/5', background: '#0b0f0d' }}>
        {urls.slice(0, 4).map((u, i) => (
          <div key={i} style={{ backgroundImage: `url("${displayThumb(u)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        ))}
        {urls.length === 0 && (
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="small muted">empty set</span>
          </div>
        )}
      </div>
      <div className="tile-body" style={{ padding: '10px 12px' }}>
        <div className="row between">
          <span className="tile-title">{set.name}</span>
          {!set.builtin ? <span className="chip brand">yours</span> : suggested ? <span className="chip accent">for you</span> : null}
        </div>
        <div className="tile-sub">{set.desc || `${urls.length} images`}</div>
      </div>
    </button>
  )
}

/**
 * Which of the two carousels to make.
 *
 * Animated carousels are metered, so this is also where the trial gets told no
 * — before a character is picked and a topic written, rather than after.
 */
function KindStep({ canAnimate, lock, onPick }) {
  return (
    <div className="grid cols-2" style={{ gap: 12 }}>
      <button className="tile" style={{ padding: 20, textAlign: 'left' }} onClick={() => onPick('photo')}>
        <div style={{ fontSize: 26, color: 'var(--brand)' }}>❏</div>
        <div className="tile-title" style={{ marginTop: 10, fontSize: 15 }}>Photo carousel</div>
        <div className="tile-sub" style={{ marginTop: 6 }}>
          Your copy over our photography, or your own. Free on your plan, instant.
        </div>
      </button>

      <button
        className="tile"
        style={{ padding: 20, textAlign: 'left', opacity: canAnimate ? 1 : 0.55 }}
        onClick={() => canAnimate && onPick('animated')}
        disabled={!canAnimate}
      >
        <div className="row between">
          <div style={{ fontSize: 26, color: 'var(--accent)' }}>✦</div>
          {!canAnimate && <span className="chip accent">{lock}</span>}
        </div>
        <div className="tile-title" style={{ marginTop: 10, fontSize: 15 }}>Animated carousel</div>
        <div className="tile-sub" style={{ marginTop: 6 }}>
          A 3D character acts out your message across every slide. Written and drawn for you.
        </div>
      </button>
    </div>
  )
}

/**
 * Brand selection, with a way out of it.
 *
 * "New brand" is a tile in the same grid rather than a link somewhere else:
 * someone making a carousel for a product they have not set up yet should not
 * have to abandon the wizard, go to the Brand page, and start again.
 */
function BrandStep({ brands, selectedId, onSelect, onNew, onBack }) {
  return (
    <>
      <div className="grid cols-3" style={{ gap: 12 }}>
        {brands.map((b) => (
          <button
            key={b.id}
            className={`tile ${selectedId === b.id ? 'selected' : ''}`}
            style={{ padding: 16, textAlign: 'left' }}
            onClick={() => onSelect(b.id)}
          >
            <div
              style={{
                width: 26, height: 26, borderRadius: 8,
                background: b.accent || 'var(--brand)', marginBottom: 10,
              }}
            />
            <div className="tile-title">{b.appName || 'Untitled brand'}</div>
            <div className="tile-sub" style={{ marginTop: 4 }}>
              {b.tagline || b.category || 'No pitch yet'}
            </div>
          </button>
        ))}

        <button
          className="tile"
          onClick={onNew}
          style={{
            padding: 16, textAlign: 'left', borderStyle: 'dashed',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 24, color: 'var(--brand)' }}>＋</div>
          <div className="tile-title" style={{ marginTop: 8 }}>New brand</div>
          <div className="tile-sub" style={{ marginTop: 4 }}>Set one up without leaving this</div>
        </button>
      </div>

      <div className="row mt-4">
        <button className="btn ghost sm" onClick={onBack}>← Character</button>
      </div>
    </>
  )
}

/** Just enough to write copy against: the name, the pitch and the category. */
function NewBrandForm({ onCancel, onCreate }) {
  const [appName, setAppName] = useState('')
  const [tagline, setTagline] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await onCreate({
        appName: appName.trim(),
        tagline: tagline.trim(),
        category: category.trim() || 'productivity',
      })
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="field mt-4">
        <label>Brand name</label>
        <input
          className="input"
          autoFocus
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          placeholder="Aurelia"
        />
      </div>
      <div className="field mt-2">
        <label>What is it?</label>
        <input
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="skincare"
        />
      </div>
      <div className="field mt-2">
        <label>One-line pitch</label>
        <input
          className="input"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="The three-step routine you will actually finish."
          onKeyDown={(e) => e.key === 'Enter' && appName.trim() && create()}
        />
      </div>
      {err && <div className="small mt-2" style={{ color: 'var(--hot)' }}>{err}</div>}
      <div className="row mt-4 between">
        <button className="btn ghost sm" onClick={onCancel}>← Brands</button>
        <button className="btn primary" disabled={!appName.trim() || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create and continue'}
        </button>
      </div>
    </>
  )
}

function AnimatedFlow({ store, onClose }) {
  const [step, setStep] = useState('character')
  const [characterId, setCharacterId] = useState(null)
  const [brandId, setBrandId] = useState(store.state.activeBrandId)
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(5)
  const [progress, setProgress] = useState({ ready: 0, total: 0 })
  const [error, setError] = useState(null)
  const abort = useRef(null)

  useEffect(() => () => abort.current?.abort(), [])

  const character = CHARACTERS.find((c) => c.id === characterId)
  const brand = store.state.brands.find((b) => b.id === brandId)

  async function generate() {
    setError(null)
    setStep('rendering')
    setProgress({ ready: 0, total: slideCount })

    const ctrl = new AbortController()
    abort.current = ctrl

    try {
      const { carouselId } = await startAnimated({ topic: topic.trim(), slideCount, characterId, brandId })
      await waitForAnimated(carouselId, {
        signal: ctrl.signal,
        onProgress: (s) => setProgress({ ready: s.ready, total: s.total || slideCount }),
      })
      // The row was written by the server, so the local store has never seen it.
      await store.reload()
      go(`/carousel/${carouselId}`)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
      setStep('brief')
    }
  }

  if (step === 'rendering') {
    const pct = progress.total ? Math.round((progress.ready / progress.total) * 100) : 0
    return (
      <>
        <div className="row between">
          <div>
            <h3>Drawing your carousel</h3>
            <div className="sub">
              {character?.name} across {slideCount} slides. This takes about half a minute.
            </div>
          </div>
        </div>
        <div className="empty" style={{ padding: 30 }}>
          <div className="big">✦</div>
          <b>{progress.ready} of {progress.total || slideCount} slides done</b>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--ink-3)', margin: '16px auto 0', maxWidth: 320, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-gradient)', transition: 'width 0.4s' }} />
          </div>
          <div className="small muted mt-4">
            The copy is written first, then every slide is drawn with the same character.
            You can leave this open — it lands in your library either way.
          </div>
        </div>
      </>
    )
  }

  if (step === 'character') {
    return (
      <>
        <div className="row between">
          <div>
            <h3>Choose your character</h3>
            <div className="sub">One character fronts every slide, in the same style throughout.</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="grid cols-4" style={{ gap: 12 }}>
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              className={`tile ${characterId === c.id ? 'selected' : ''}`}
              onClick={() => {
                setCharacterId(c.id)
                setStep('brand')
              }}
            >
              <div style={{ aspectRatio: '4/5', overflow: 'hidden', background: '#131019' }}>
                <img
                  src={c.img}
                  alt={c.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div className="tile-body" style={{ padding: '10px 12px' }}>
                <div className="tile-title">{c.name}</div>
                <div className="tile-sub">{c.blurb}</div>
              </div>
            </button>
          ))}
        </div>
      </>
    )
  }

  if (step === 'brand' || step === 'newBrand') {
    return (
      <>
        <div className="row between">
          <div>
            <h3>{step === 'brand' ? 'Which brand is this for?' : 'New brand'}</h3>
            <div className="sub">
              {step === 'brand'
                ? 'The copy is written from the brand’s name, pitch and category.'
                : 'Enough to write from. You can fill in the rest on the Brand page later.'}
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>

        {step === 'brand' ? (
          <BrandStep
            brands={store.state.brands}
            selectedId={brandId}
            onSelect={(id) => {
              setBrandId(id)
              setStep('brief')
            }}
            onNew={() => setStep('newBrand')}
            onBack={() => setStep('character')}
          />
        ) : (
          <NewBrandForm
            onCancel={() => setStep('brand')}
            onCreate={async (patch) => {
              const created = await store.createBrand(patch)
              setBrandId(created.id)
              setStep('brief')
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="row between">
        <div>
          <h3>What should it say?</h3>
          <div className="sub">
            {character?.name} will act it out for <b>{brand?.appName || 'your brand'}</b>.
          </div>
        </div>
        <button className="btn ghost sm" onClick={onClose}>✕</button>
      </div>

      <div className="field mt-4">
        <label>What is this carousel about?</label>
        <textarea
          className="input"
          rows={3}
          autoFocus
          maxLength={400}
          placeholder="e.g. why most skincare routines fall apart after week two"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="small muted mt-2">{topic.trim().length}/400</div>
      </div>

      <div className="field mt-4">
        <label>Slides — {slideCount}</label>
        <input
          type="range"
          min="3"
          max="8"
          value={slideCount}
          onChange={(e) => setSlideCount(+e.target.value)}
        />
      </div>

      {error && (
        <div className="card mt-4" style={{ borderColor: 'rgba(255,122,89,0.4)' }}>
          <div className="row"><span className="chip hot">could not generate</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      <div className="row mt-4 between">
        <button className="btn ghost sm" onClick={() => setStep('brand')}>← Brand</button>
        <button className="btn primary" disabled={!topic.trim() || !brandId} onClick={generate}>
          ✦ Generate {slideCount} slides
        </button>
      </div>
    </>
  )
}

function NewCarouselWizard({ store, onClose }) {
  const { can, entitlement } = useAuth()
  const [kind, setKind] = useState(null)
  const [step, setStep] = useState(0)
  const [setId, setSetId] = useState(null)
  const sets = store.allSets()
  const chosen = store.getSet(setId)
  const isCustom = chosen && !chosen.builtin
  const options = presetOptions(store.state.brand)

  // id is passed explicitly — setSetId hasn't committed yet when called from pickSet
  function create(presetId, id = setId) {
    const proj = buildCarousel(store, id, presetId)
    store.saveCarousel(proj)
    window.location.hash = `/carousel/${proj.id}`
  }

  // custom sets skip the copy picker — the user writes their own
  function pickSet(id) {
    const s = store.getSet(id)
    setSetId(id)
    if (s && !s.builtin) create('blank', id)
    else setStep(1)
  }

  if (!kind) {
    return (
      <div className="modal-veil" onClick={onClose}>
        <div className="modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
          <div className="row between">
            <div>
              <h3>Mint a carousel</h3>
              <div className="sub">Two kinds. Both stay fully editable afterwards.</div>
            </div>
            <button className="btn ghost sm" onClick={onClose}>✕</button>
          </div>
          <KindStep
            canAnimate={can.animated}
            lock={lockReason('animated', entitlement)}
            onPick={setKind}
          />
        </div>
      </div>
    )
  }

  if (kind === 'animated') {
    return (
      <div className="modal-veil" onClick={onClose}>
        <div className="modal" style={{ width: 'min(860px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
          <AnimatedFlow store={store} onClose={onClose} />
        </div>
      </div>
    )
  }

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" style={{ width: 'min(860px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>{step === 0 ? 'Choose a photo set' : 'Choose your angle'}</h3>
            <div className="sub">
              {step === 0
                ? 'The look and feel of your carousel. Your own sets skip straight to a blank carousel.'
                : `Each option writes a different full carousel for ${store.state.brand.appName || 'your product'}. Here’s the hook you’d open with.`}
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>

        {step === 0 && (
          <div className="grid cols-3" style={{ gap: 12 }}>
            {sets.map((s) => (
              <SetTile
                key={s.id} set={s} selected={setId === s.id}
                suggested={s.id === suggestedSetId(store.state.brand.category)}
                onSelect={() => pickSet(s.id)}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="grid" style={{ gap: 8 }}>
              {options.map((o) => (
                <button
                  key={o.id}
                  className="tile"
                  style={{ padding: '14px 16px', display: 'block' }}
                  onClick={() => create(o.id)}
                >
                  <div className="row between">
                    <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15 }}>“{o.hook}”</span>
                    <span className="chip">{o.name}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="row mt-4 between">
              <button className="btn ghost sm" onClick={() => setStep(0)}>← Photo sets</button>
              <button className="btn sm" onClick={() => create('blank')}>Start blank instead</button>
            </div>

          </>
        )}
      </div>
    </div>
  )
}

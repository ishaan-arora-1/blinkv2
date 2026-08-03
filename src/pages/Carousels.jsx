import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { buildPreset, blankCopy, presetOptions } from '../lib/copygen.js'
import { pickRandom, suggestedSetId } from '../lib/library.js'
import { newId, uid } from '../lib/ids.js'
import { useSetImages } from '../lib/useImages.js'

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
    presetId: copy.presetId,
    setAssignment: assignment,
    slides,
  }
}

function CarouselCard({ proj, store }) {
  const set0 = store.getSet(proj.setAssignment.hook)
  const urls = useSetImages(set0)
  const bg = typeof proj.slides[0]?.bg === 'string' ? proj.slides[0].bg : urls[0]
  return (
    <div className="tile" style={{ cursor: 'pointer' }} onClick={() => (window.location.hash = `/carousel/${proj.id}`)}>
      <div style={{
        aspectRatio: '4/3', backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: 'cover',
        backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', padding: 14,
        background: bg ? undefined : 'linear-gradient(120deg,#1a221c,#0f1411)',
      }}>
        <span className="chip mint">{proj.slides.length} slides</span>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, aspectRatio: '4/3', background: '#0b0f0d' }}>
        {urls.slice(0, 4).map((u, i) => (
          <div key={i} style={{ backgroundImage: `url(${u})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
          {!set.builtin ? <span className="chip mint">yours</span> : suggested ? <span className="chip sea">for you</span> : null}
        </div>
        <div className="tile-sub">{set.desc || `${urls.length} images`}</div>
      </div>
    </button>
  )
}

function NewCarouselWizard({ store, onClose }) {
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

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" style={{ width: 'min(860px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>{step === 0 ? 'Choose a photo set' : 'Choose your angle'}</h3>
            <div className="sub">
              {step === 0
                ? 'The look and feel of your carousel. Your own sets skip straight to a blank carousel.'
                : `Each option writes a different full carousel for ${store.state.brand.appName || 'your app'}. Here’s the hook you’d open with.`}
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

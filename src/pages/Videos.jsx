import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { CREATORS } from '../lib/creators.js'
import { newId } from '../lib/ids.js'

export default function Videos() {
  const store = useStore()
  const { videos } = store.state
  const [wizard, setWizard] = useState(false)

  const valid = videos.filter((p) => store.getCharacter(p.characterId))

  return (
    <div>
      <div className="page-head row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker">Create</div>
          <h1 className="page-title">Hook <em>videos</em></h1>
          <p className="page-sub">
            A real AI creator reacts to your app in a 3-second hook, then your screen-recorded demo plays.
            Trim it, score it, caption it, export it.
          </p>
        </div>
        <button className="btn primary" onClick={() => setWizard(true)}>▶ New video</button>
      </div>

      {valid.length === 0 ? (
        <div className="empty">
          <div className="big">▶</div>
          <b>No videos yet.</b>
          <div className="small mt-2">Pick a creator, pick their hook, upload your demo. Done in minutes.</div>
        </div>
      ) : (
        <div className="grid cols-3">
          {[...valid].sort((a, b) => b.createdAt - a.createdAt).map((p) => {
            const char = store.getCharacter(p.characterId)
            return (
              <div key={p.id} className="tile" style={{ cursor: 'pointer' }} onClick={() => (window.location.hash = `/video/${p.id}`)}>
                <div style={{ aspectRatio: '16/10', overflow: 'hidden', background: '#0b0f0d' }}>
                  <img src={char.img} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                </div>
                <div className="tile-body">
                  <div className="tile-title">{p.name}</div>
                  <div className="row between mt-2">
                    <span className="tile-sub">{char.name} · {p.demoPath ? 'demo attached' : 'no demo yet'}</span>
                    <button className="btn xs danger" onClick={(e) => { e.stopPropagation(); if (confirm('Delete this video?')) store.deleteVideo(p.id) }}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {wizard && <NewVideoWizard store={store} onClose={() => setWizard(false)} />}
    </div>
  )
}

function NewVideoWizard({ store, onClose }) {
  const [step, setStep] = useState(0)
  const [charId, setCharId] = useState(null)
  const char = store.getCharacter(charId)
  const brand = store.state.brand

  function createProject(h) {
    const proj = {
      id: newId(),
      name: `${char.name} × ${brand.appName || 'demo'}`,
      createdAt: Date.now(),
      characterId: charId,
      hook: {
        id: h.id, src: h.src, label: h.label,
        duration: h.maxDuration, maxDuration: h.maxDuration,
        caption: defaultCaption(brand),
      },
      demoPath: null,
      demoDuration: 0,
      demoTrim: { start: 0, end: 0 },
      audio: { trackId: 'hype', volume: 0.8 },
      overlays: [],
    }
    store.saveVideo(proj)
    window.location.hash = `/video/${proj.id}`
  }

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" style={{ width: 'min(880px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>{step === 0 ? 'Choose your creator' : `Pick ${char?.name}'s hook`}</h3>
            <div className="sub">
              {step === 0
                ? 'Real AI creators, one consistent look. They deliver the first 3 seconds.'
                : 'Two premade reactions per creator — pick the one that fits your app.'}
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>

        {step === 0 && (
          <>
            <div className="grid cols-4" style={{ gap: 12 }}>
              {CREATORS.map((c) => (
                <button key={c.id} className={`tile ${charId === c.id ? 'selected' : ''}`} onClick={() => setCharId(c.id)}>
                  <div style={{ aspectRatio: '3/4', overflow: 'hidden' }}>
                    <img src={c.img} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div className="tile-body" style={{ padding: '10px 12px' }}>
                    <div className="tile-title">{c.name}</div>
                    <div className="tile-sub">{c.vibe}</div>
                  </div>
                </button>
              ))}
              <div className="tile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 8, opacity: 0.55, cursor: 'default' }}>
                <div style={{ fontSize: 30, color: 'var(--mint)' }}>◇</div>
                <b>Custom creators</b>
                <span className="small muted" style={{ textAlign: 'center', padding: '0 10px' }}>Design your own — coming soon</span>
              </div>
            </div>
            <div className="row mt-4" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" disabled={!charId} onClick={() => setStep(1)}>Next: pick a hook →</button>
            </div>
          </>
        )}


        {step === 1 && char && (
          <>
            <div className="grid cols-3" style={{ gap: 14 }}>
              {char.hooks.map((h) => (
                <button key={h.id} className="tile" onClick={() => createProject(h)}>
                  <div style={{ aspectRatio: '9/13', overflow: 'hidden', background: '#000' }}>
                    <video
                      src={h.src} muted loop playsInline autoPlay
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div className="tile-body" style={{ padding: '10px 12px' }}>
                    <div className="tile-title">{h.label}</div>
                    <div className="row between mt-2">
                      <span className="chip">{h.maxDuration}s</span>
                      <span className="chip mint">premade</span>
                    </div>
                  </div>
                </button>
              ))}
              <div className="tile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 8, opacity: 0.55, cursor: 'default' }}>
                <div style={{ fontSize: 30, color: 'var(--sea)' }}>✦</div>
                <b>Generate a hook</b>
                <span className="small muted" style={{ textAlign: 'center', padding: '0 10px' }}>Custom reactions for {char.name} — coming soon</span>
              </div>
            </div>
            <div className="row mt-4">
              <button className="btn ghost sm" onClick={() => setStep(0)}>← Creators</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function defaultCaption(brand) {
  const app = brand.appName || 'this app'
  const pool = [
    `Wait… ${app} does WHAT?!`,
    `Nobody told me about ${app}`,
    `POV: you find THE app`,
    `${app} just changed everything`,
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

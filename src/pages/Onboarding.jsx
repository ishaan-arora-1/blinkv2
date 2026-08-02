import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import BrandForm from '../components/BrandForm.jsx'

export default function Onboarding() {
  const store = useStore()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(store.state.brand)

  if (step === 0) {
    return (
      <div className="hero">
        <div className="chip mint" style={{ marginBottom: 22 }}>reelmint — beta</div>
        <h1>Your iOS app deserves <em>louder</em> marketing.</h1>
        <p>
          Mint scroll-stopping carousels and character-led hook videos for your app —
          designed, written and exported in minutes, not weekends.
        </p>
        <div className="cta-row">
          <button className="btn primary" onClick={() => setStep(1)}>Set up my brand →</button>
        </div>
        <div className="mono small muted" style={{ marginTop: 40, zIndex: 1, letterSpacing: '0.1em' }}>
          CAROUSELS ✕ HOOK VIDEOS ✕ IMAGE SETS ✕ CHARACTERS
        </div>
      </div>
    )
  }

  return (
    <div className="hero" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(640px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
        <div className="page-kicker">Step 1 of 1 — brand intel</div>
        <h2 style={{ marginBottom: 6 }}>Tell us about your app</h2>
        <p className="muted small" style={{ marginBottom: 20 }}>
          Everything we generate — hooks, slides, CTAs — is written from this. You can change it anytime.
        </p>
        <BrandForm brand={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            className="btn primary"
            disabled={!draft.appName.trim()}
            onClick={() => { store.setBrand({ ...draft, onboarded: true }); window.location.hash = '/dashboard' }}
          >
            Enter the studio →
          </button>
        </div>
      </div>
    </div>
  )
}

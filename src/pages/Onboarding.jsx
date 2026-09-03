import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { isPaying } from '../lib/tiers.js'
import BrandForm from '../components/BrandForm.jsx'

export default function Onboarding() {
  const store = useStore()
  const { entitlement } = useAuth()

  // Someone who has already paid does not need to be sold to on the way in.
  // The interstitial below pitches the product; they bought it two screens ago,
  // and putting a pitch between their money and the thing they bought reads as
  // a second ask. They go straight to the one form that is actually setup.
  const paid = isPaying(entitlement)
  const [step, setStep] = useState(paid ? 1 : 0)
  const [draft, setDraft] = useState(store.state.brand)
  const [saving, setSaving] = useState(false)

  if (step === 0) {
    return (
      <div className="hero">
        <div className="chip brand" style={{ marginBottom: 22 }}>Blink UGC — beta</div>
        <h1>Your product deserves <em>louder</em> marketing.</h1>
        <p>
          Mint scroll-stopping carousels and creator-led hook videos for your product —
          designed, written and exported in minutes, not weekends.
        </p>
        <div className="cta-row">
          <button className="btn primary" onClick={() => setStep(1)}>Set up my brand →</button>
        </div>
        <div className="mono small muted" style={{ marginTop: 40, zIndex: 1, letterSpacing: '0.1em' }}>
          CAROUSELS ✕ HOOK VIDEOS ✕ AI CREATORS ✕ PHOTO SETS
        </div>
      </div>
    )
  }

  return (
    <div className="hero" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(640px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
        <div className="page-kicker">
          {paid ? 'Last step — tell us what to make ads about' : 'Step 1 of 1 — brand intel'}
        </div>
        <h2 style={{ marginBottom: 6 }}>Tell us about your product</h2>
        <p className="muted small" style={{ marginBottom: 20 }}>
          {paid
            ? 'Your plan is active. This is what every scene, script and voiceover gets written from — the product name is the only part we need right now.'
            : 'Everything we generate — hooks, slides, CTAs — is written from this. You can change it anytime.'}
        </p>
        <BrandForm brand={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            className="btn primary"
            disabled={!draft.appName.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await store.setBrand({ ...draft, onboarded: true }, { immediate: true })
                window.location.hash = '/dashboard'
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Setting up…' : 'Enter the studio →'}
          </button>
        </div>
      </div>
    </div>
  )
}

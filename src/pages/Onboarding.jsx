import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { isPaying } from '../lib/tiers.js'
import BrandForm from '../components/BrandForm.jsx'

/**
 * The one form between signing up and the studio.
 *
 * There used to be a pitch in front of it — a hero headline about deserving
 * louder marketing, over a button that did nothing but reveal this form. It was
 * shown to people who had just read the landing page and signed up off it, so
 * it sold the product to someone who had already bought the argument, and cost
 * a click to dismiss. Anyone arriving here has decided; this asks the one thing
 * the generator cannot run without and gets out of the way.
 */
export default function Onboarding() {
  const store = useStore()
  const { entitlement } = useAuth()

  // Changes the copy, not the path: someone who has already paid is being told
  // their plan is live, everyone else is being told what this is for.
  const paid = isPaying(entitlement)
  const [draft, setDraft] = useState(store.state.brand)
  const [saving, setSaving] = useState(false)

  return (
    <div className="hero" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(640px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
        <div className="page-kicker">
          {paid ? 'Last step — tell us what to make ads about' : 'One step — brand intel'}
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

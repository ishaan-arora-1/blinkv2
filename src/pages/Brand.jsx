import React, { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import BrandForm from '../components/BrandForm.jsx'

export default function Brand() {
  const store = useStore()
  const { brands, activeBrandId } = store.state
  const active = store.state.brand
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function addBrand() {
    setBusy(true)
    setError(null)
    try {
      await store.createBrand({ appName: '', onboarded: true })
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function removeBrand() {
    if (!confirm(`Delete "${active.appName || 'this brand'}"? Carousels and videos made for it are kept.`)) return
    setError(null)
    try {
      await store.deleteBrand(activeBrandId)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="page-head row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker">Brand</div>
          <h1 className="page-title">Your product's <em>voice</em></h1>
          <p className="page-sub">
            All generated copy — hooks, body slides, CTAs, video captions — is built from this
            profile. Keep one per product you market.
          </p>
        </div>
        <button className="btn primary" onClick={addBrand} disabled={busy}>
          {busy ? 'Adding…' : '＋ New brand'}
        </button>
      </div>

      {brands.length > 1 && (
        <div className="grid cols-4" style={{ gap: 12, marginBottom: 20 }}>
          {brands.map((b) => (
            <button
              key={b.id}
              className={`tile ${b.id === activeBrandId ? 'selected' : ''}`}
              style={{ padding: 14, textAlign: 'left' }}
              onClick={() => store.setActiveBrand(b.id)}
            >
              <div
                style={{
                  width: 22, height: 22, borderRadius: 7,
                  background: b.accent || 'var(--brand)', marginBottom: 8,
                }}
              />
              <div className="tile-title">{b.appName || 'Untitled brand'}</div>
              <div className="tile-sub" style={{ marginTop: 3 }}>{b.category || '—'}</div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="card" style={{ maxWidth: 640, marginBottom: 16, borderColor: 'rgba(255,122,89,0.4)' }}>
          <div className="small">{error}</div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 640 }}>
        {/* Keyed on the brand so switching resets the form's internal state
            rather than showing the previous brand's values in the new one. */}
        <BrandForm key={activeBrandId} brand={active} onChange={(patch) => store.setBrand(patch)} />
        <div className="row between mt-4">
          <div className="small muted">Changes save automatically.</div>
          {brands.length > 1 && (
            <button className="btn ghost xs danger" onClick={removeBrand}>Delete this brand</button>
          )}
        </div>
      </div>
    </div>
  )
}

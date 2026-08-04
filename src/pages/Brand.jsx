import React from 'react'
import { useStore } from '../lib/store.jsx'
import BrandForm from '../components/BrandForm.jsx'

export default function Brand() {
  const store = useStore()
  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Brand</div>
        <h1 className="page-title">Your product's <em>voice</em></h1>
        <p className="page-sub">All generated copy — hooks, body slides, CTAs, video captions — is built from this profile.</p>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <BrandForm brand={store.state.brand} onChange={(patch) => store.setBrand(patch)} />
        <div className="small muted">Changes save automatically.</div>
      </div>
    </div>
  )
}

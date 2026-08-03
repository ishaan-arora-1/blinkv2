import React from 'react'
import { useStore } from '../lib/store.jsx'

export default function Dashboard() {
  const store = useStore()
  const { brand, carousels, videos } = store.state

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Studio</div>
        <h1 className="page-title">
          Let's market <em>{brand.appName || 'your product'}</em>
        </h1>
        <p className="page-sub">{brand.tagline || 'Pick a format and start minting content.'}</p>
      </div>

      <div className="grid cols-2">
        <button className="tile" onClick={() => (window.location.hash = '/carousels')} style={{ padding: 0 }}>
          <div style={{
            height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(120deg, rgba(168, 120, 255,0.16), rgba(168, 120, 255,0.03))', fontSize: 52,
          }}>❏❏❏</div>
          <div className="tile-body">
            <div className="row between">
              <span className="tile-title" style={{ fontSize: 17 }}>Carousels</span>
              <span className="chip brand">{carousels.length} project{carousels.length === 1 ? '' : 's'}</span>
            </div>
            <div className="tile-sub">Hook → body → CTA slides over curated lifestyle photography. Shuffle backgrounds, edit everything, export 1080×1350.</div>
          </div>
        </button>

        <button className="tile" onClick={() => (window.location.hash = '/videos')} style={{ padding: 0 }}>
          <div style={{
            height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(120deg, rgba(243, 164, 230,0.14), rgba(243, 164, 230,0.03))', fontSize: 52,
          }}>▶</div>
          <div className="tile-body">
            <div className="row between">
              <span className="tile-title" style={{ fontSize: 17 }}>Hook videos</span>
              <span className="chip accent">{videos.length} project{videos.length === 1 ? '' : 's'}</span>
            </div>
            <div className="tile-sub">An AI creator reacts to your product, then your screen recording plays. Trim, add music and captions, export video.</div>
          </div>
        </button>
      </div>

      <div className="mt-6 grid cols-3">
        <div className="card">
          <div className="chip">workflow</div>
          <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>1 · Feed the brand</h3>
          <p className="small muted">Your product's name, pitch and tone drive every generated hook and CTA.</p>
        </div>
        <div className="card">
          <div className="chip">workflow</div>
          <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>2 · Mint content</h3>
          <p className="small muted">Generate carousels & hook videos, then art-direct: shuffle, drag, restyle.</p>
        </div>
        <div className="card">
          <div className="chip">workflow</div>
          <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>3 · Export & post</h3>
          <p className="small muted">PNG slides sized for Instagram, video files ready for Reels & TikTok.</p>
        </div>
      </div>
    </div>
  )
}

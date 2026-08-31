import React from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { planFor } from '../lib/tiers.js'

export default function Dashboard() {
  const store = useStore()
  const { can } = useAuth()
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

      {/* Blink AI sits above the pair and spans both, because it is the one
          that makes a finished video rather than a piece of one. The other two
          are formats; this is the whole thing. */}
      <button
        className="tile"
        onClick={() => (window.location.hash = '/blink')}
        style={{ padding: 0, width: '100%', marginBottom: 18, textAlign: 'left' }}
      >
        <div style={{
          minHeight: 170, display: 'flex', alignItems: 'center', gap: 22, padding: '26px 28px', flexWrap: 'wrap',
          background: 'linear-gradient(120deg, rgba(168, 120, 255,0.22), rgba(243, 164, 230,0.10) 55%, rgba(168, 120, 255,0.03))',
        }}>
          <div style={{ fontSize: 60, lineHeight: 1 }}>✦</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <span className="chip brand">Blink AI</span>
              {!can.multiframe && <span className="chip">{planFor('multiframe')} plan</span>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
              Describe a video. Get the whole thing.
            </div>
            <div className="tile-sub" style={{ fontSize: 14, maxWidth: 620 }}>
              Multi-scene videos, as long as you need. One idea is broken into scenes, each gets its own
              filmed shot, and they are cut together with a single voiceover and subtitles — holding your
              product identical in every frame.
            </div>
          </div>
          <div className="chip accent" style={{ alignSelf: 'flex-end' }}>Start a reel →</div>
        </div>
      </button>

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

      <div className="mt-6 grid cols-3 stack-sm">
        <div className="card">
          <div className="chip">workflow</div>
          <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>1 · Feed the brand</h3>
          <p className="small muted">Your product's name, pitch and tone drive every generated hook and CTA.</p>
        </div>
        <div className="card">
          <div className="chip">workflow</div>
          <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>2 · Mint content</h3>
          <p className="small muted">Generate a Blink AI reel, carousels or hook videos, then art-direct: shuffle, drag, restyle.</p>
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

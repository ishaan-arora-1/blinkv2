import React, { useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { CREATORS, hookPoster } from '../lib/creators.js'
import { newId } from '../lib/ids.js'
import HookPreview from '../components/HookPreview.jsx'
import Upsell from '../components/Upsell.jsx'

export default function Videos() {
  const store = useStore()
  const { can } = useAuth()
  const { videos } = store.state
  const [wizard, setWizard] = useState(false)

  const valid = videos.filter((p) => store.getCharacter(p.characterId))

  // Videos a free account made before this was a paid feature stay listed and
  // openable below. What Creator buys is making another one, so only the
  // wizard is behind the lock.
  const head = (
    <div className="page-head row between" style={{ alignItems: 'flex-end' }}>
      <div>
        <div className="page-kicker">Create</div>
        <h1 className="page-title">Hook <em>videos</em></h1>
        <p className="page-sub">
          A real AI creator reacts to your product in a 3-second hook, then your screen recording plays.
          Trim it, score it, caption it, export it.
        </p>
      </div>
      {can.videos && <button className="btn primary" onClick={() => setWizard(true)}>▶ New video</button>}
    </div>
  )

  if (!can.videos) {
    return (
      <div>
        {head}
        <Upsell
          feature="videos"
          pitch="Every creator in the roster, unlimited hooks, your screen recording cut in behind them, exported at 1080 × 1920 for Reels and TikTok."
        />
        {valid.length > 0 && (
          <div className="grid portrait mt-6">
            {[...valid].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
              <VideoCard key={p.id} proj={p} char={store.getCharacter(p.characterId)} store={store} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {head}

      {valid.length === 0 ? (
        <div className="empty">
          <div className="big">▶</div>
          <b>No videos yet.</b>
          <div className="small mt-2">Pick a creator, pick their hook, upload your demo. Done in minutes.</div>
        </div>
      ) : (
        <div className="grid portrait">
          {[...valid].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
            <VideoCard key={p.id} proj={p} char={store.getCharacter(p.characterId)} store={store} />
          ))}
        </div>
      )}

      {wizard && <NewVideoWizard store={store} onClose={() => setWizard(false)} />}
    </div>
  )
}

/**
 * A project tile that previews the actual hook, at the ratio it exports at.
 *
 * It used to show the creator's portrait in a 16:10 letterbox — a landscape crop
 * of a portrait photo, standing in for a 9:16 video. Nothing about it told you
 * what the video looked like.
 *
 * The still is the clip's poster frame, and `preload="none"` means the 5 MB clip
 * is not fetched until the pointer is actually on the tile. A grid of these
 * costs ~30 KB per tile instead of ~5 MB.
 */
function VideoCard({ proj, char, store }) {
  const vidRef = useRef(null)
  const poster = hookPoster(proj.hook) || char.img

  function play() {
    const v = vidRef.current
    if (!v) return
    // A rejected play() is normal — the tab may be backgrounded, or the pointer
    // left again before the video was ready. It is not worth an unhandled
    // rejection in the console.
    v.play().catch(() => {})
  }

  function stop() {
    const v = vidRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <div
      className="tile"
      style={{ cursor: 'pointer' }}
      onClick={() => (window.location.hash = `/video/${proj.id}`)}
      onMouseEnter={play}
      onMouseLeave={stop}
    >
      <div className="thumb-9x16">
        {proj.hook?.src ? (
          <video ref={vidRef} src={proj.hook.src} poster={poster} muted loop playsInline preload="none" />
        ) : (
          <img src={char.img} alt={char.name} />
        )}
        <span className="chip brand">{proj.demoPath ? 'hook + demo' : 'hook only'}</span>
      </div>
      <div className="tile-body">
        <div className="tile-title">{proj.name}</div>
        <div className="row between mt-2">
          <span className="tile-sub">{char.name}</span>
          <button
            className="btn xs danger"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('Delete this video?')) store.deleteVideo(proj.id)
            }}
          >
            Delete
          </button>
        </div>
      </div>
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
                : 'Two premade reactions per creator — pick the one that fits your product.'}
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
                <div style={{ fontSize: 30, color: 'var(--brand)' }}>◇</div>
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
                  {/* 9:16, matching the export, so the framing shown is the
                      framing delivered. Hover to play. */}
                  <HookPreview hook={h} alt={h.label} />
                  <div className="tile-body" style={{ padding: '10px 12px' }}>
                    <div className="tile-title">{h.label}</div>
                    <div className="row between mt-2">
                      <span className="chip">{h.maxDuration}s</span>
                      <span className="chip brand">premade</span>
                    </div>
                  </div>
                </button>
              ))}
              <div className="tile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 8, opacity: 0.55, cursor: 'default' }}>
                <div style={{ fontSize: 30, color: 'var(--accent)' }}>✦</div>
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
  const app = brand.appName || 'this product'
  const pool = [
    `Wait… ${app} does WHAT?!`,
    `Nobody told me about ${app}`,
    `POV: you finally found ${app}`,
    `${app} just changed everything`,
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

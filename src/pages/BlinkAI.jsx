import React, { useEffect, useRef, useState } from 'react'
import CreatorPicker from '../components/CreatorPicker.jsx'
import { LIMITS, startGeneration, awaitGeneration } from '../lib/blink.js'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { go } from '../lib/router.js'
import { planFor, PLAN_NAME } from '../lib/tiers.js'

export default function BlinkAI() {
  const store = useStore()
  const { can, entitlement } = useAuth()

  const [prompt, setPrompt] = useState('')
  const [product, setProduct] = useState(null)
  const [productURL, setProductURL] = useState(null)
  const [creator, setCreator] = useState(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  // generation settings
  const [duration, setDuration] = useState(LIMITS.duration.default)
  const [aspect, setAspect] = useState('9:16')
  const [resolution, setResolution] = useState('1080p')
  const [negative, setNegative] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Leaving the page must not leave a poll running.
  useEffect(() => () => abortRef.current?.abort(), [])

  // A render that was in flight when the tab was closed is still running on the
  // server. Pick the newest one back up rather than stranding it.
  useEffect(() => {
    const pending = store.state.blinks.find((b) => b.status === 'rendering' || b.status === 'pending')
    if (!pending || busy) return
    resume(pending.id)
    // Only ever re-attach once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onProduct(file) {
    if (!file) return
    setProduct(file)
    setProductURL(URL.createObjectURL(file))
  }

  async function resume(blinkId) {
    setBusy(true)
    setError(null)
    setResult(null)
    setStatus('Picking up where you left off…')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const done = await awaitGeneration(blinkId, { onStatus: setStatus, signal: ctrl.signal })
      setResult(done)
      await store.refreshBlinks()
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      await store.refreshBlinks()
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  async function run() {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    setStatus('Sending to Veo…')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const { blinkId } = await startGeneration({
        prompt: prompt.trim(),
        productFile: product,
        creator,
        options: {
          durationSeconds: duration,
          aspectRatio: aspect,
          resolution,
          negativePrompt: negative,
        },
      })

      // The row exists now, so the library shows it rendering straight away.
      await store.refreshBlinks()

      const done = await awaitGeneration(blinkId, { onStatus: setStatus, signal: ctrl.signal })
      setResult(done)
      await store.refreshBlinks()
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      await store.refreshBlinks()
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  // ── gated ────────────────────────────────────────────────────────────────
  // A paying customer on a lower plan gets an upgrade pitch; someone with no
  // plan at all gets pointed at pricing, since "upgrade" would be nonsense.
  const onLowerPaidPlan = Boolean(PLAN_NAME[entitlement.tier]) && !can.blink

  if (!can.blink) {
    return (
      <div>
        <div className="page-head">
          <div className="page-kicker">Blink AI</div>
          <h1 className="page-title">Say it, and <em>blink</em> it into a video</h1>
          <p className="page-sub">
            Describe the video you want and Google Veo renders it — optionally anchored to one of
            our creators and your own product photo.
          </p>
        </div>

        <div className="card upsell" style={{ maxWidth: 620 }}>
          <div className="row"><span className="chip accent">{planFor('blink')} plan</span></div>
          <h3 style={{ margin: '12px 0 8px' }}>Blink AI is part of {planFor('blink')}</h3>
          <p className="small muted">
            {onLowerPaidPlan
              ? `Your ${PLAN_NAME[entitlement.tier]} plan covers carousels and hook videos. Upgrade to ${planFor('blink')} to generate video from a prompt.`
              : `Pick the ${planFor('blink')} plan to generate video from a prompt.`}
          </p>
          <div className="row mt-4">
            <button className="btn primary" onClick={() => go('/pricing')}>
              {onLowerPaidPlan ? `Upgrade to ${planFor('blink')} →` : 'See plans →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Blink AI</div>
        <h1 className="page-title">Say it, and <em>blink</em> it into a video</h1>
        <p className="page-sub">
          Describe the video you want. Attach your product and pick a creator if it helps — both are optional.
        </p>
      </div>

      {/* ── composer ── */}
      <div className="card" style={{ maxWidth: 780, padding: 22 }}>
        <textarea
          className="input"
          style={{ minHeight: 96, fontSize: 16, border: 'none', background: 'transparent', padding: 0, resize: 'none' }}
          placeholder="A 6-second video of the creator holding the product up to the camera, smiling, bright kitchen…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
        />

        <div className="row between mt-4" style={{ alignItems: 'flex-end' }}>
          <div className="row wrap">
            {productURL ? (
              <div className="row" style={{ gap: 8 }}>
                <img src={productURL} alt="product" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }} />
                <button className="btn xs" onClick={() => { setProduct(null); setProductURL(null) }}>Remove product</button>
              </div>
            ) : (
              <button className="btn sm" onClick={() => fileRef.current?.click()}>⬆ Upload your product</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { onProduct(e.target.files[0]); e.target.value = '' }} />

            {creator ? (
              <div className="row" style={{ gap: 8 }}>
                <img src={creator.img} alt={creator.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }} />
                <span className="chip accent">{creator.name}</span>
                <button className="btn xs" onClick={() => setPicking(true)}>Change</button>
                <button className="btn xs" onClick={() => setCreator(null)}>Remove</button>
              </div>
            ) : (
              <button className="btn sm" onClick={() => setPicking(true)}>◍ Choose creator</button>
            )}
          </div>

          <button className="btn primary" disabled={!prompt.trim() || busy} onClick={run}>
            {busy ? '✦ Generating…' : '✦ Generate video'}
          </button>
        </div>

        {/* ── settings ── */}
        <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 18, paddingTop: 16 }}>
          <div className="grid cols-3" style={{ gap: 18 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Duration — {duration}s</label>
              <input
                type="range" min={LIMITS.duration.min} max={LIMITS.duration.max} step="1"
                value={duration} onChange={(e) => setDuration(+e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Aspect ratio</label>
              <div className="seg">
                {LIMITS.aspectRatios.map((a) => (
                  <button key={a} className={aspect === a ? 'on' : ''} onClick={() => setAspect(a)}>
                    {a === '9:16' ? '9:16 vertical' : '16:9 wide'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Resolution</label>
              <div className="seg">
                {LIMITS.resolutions.map((r) => (
                  <button key={r} className={resolution === r ? 'on' : ''} onClick={() => setResolution(r)}>{r}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="row between mt-4">
            <span className="small muted">Veo generates its own audio automatically.</span>
            <button className="btn ghost xs" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? 'Hide' : 'More options'}
            </button>
          </div>

          {showAdvanced && (
            <div className="field mt-4" style={{ marginBottom: 0 }}>
              <label>Avoid (negative prompt)</label>
              <input
                className="input" value={negative} onChange={(e) => setNegative(e.target.value)}
                placeholder="e.g. blurry, text overlays, extra hands, cartoon"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── output ── */}
      {(busy || result || error) && (
        <div className="card mt-6" style={{ maxWidth: 780 }}>
          {busy && (
            <div className="row between">
              <div className="row" style={{ gap: 12 }}>
                <span className="tick" style={{ fontSize: 22 }}>✦</span>
                <div>
                  <b>{status || 'Working…'}</b>
                  <div className="small muted">
                    Video generation usually takes 1–3 minutes. You can leave this page — it keeps
                    rendering and lands in your library.
                  </div>
                </div>
              </div>
              <button className="btn ghost xs" onClick={() => abortRef.current?.abort()}>Stop watching</button>
            </div>
          )}

          {error && (
            <>
              <div className="row"><span className="chip hot">error</span></div>
              <div className="small mt-2">{error}</div>
            </>
          )}

          {result?.status === 'ready' && result.url && (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <h4 style={{ color: 'var(--accent)' }}>Your video</h4>
                <a className="btn sm" href={result.url} download="blink-ai.mp4">⬇ Download</a>
              </div>
              <video src={result.url} controls autoPlay loop playsInline
                style={{ width: aspect === '16:9' ? 460 : 300, borderRadius: 14, display: 'block', border: '1px solid var(--line)' }} />
              <div className="row mt-4 wrap">
                <span className="chip">{duration}s</span>
                <span className="chip">{aspect}</span>
                <span className="chip">{resolution}</span>
                <span className="chip accent">audio</span>
                <a className="chip brand" href="#/library" style={{ textDecoration: 'none' }}>
                  saved to library ↗
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {picking && (
        <CreatorPicker
          selectedId={creator?.id}
          title="Choose creator"
          sub="They'll be the person in your generated video."
          onSelect={(c) => { setCreator(c); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

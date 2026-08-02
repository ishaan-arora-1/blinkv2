import React, { useRef, useState } from 'react'
import CreatorPicker from '../components/CreatorPicker.jsx'
import { generate, hasKey, LIMITS } from '../lib/blink.js'
import { useStore } from '../lib/store.jsx'
import { putBlob, uid } from '../lib/idb.js'

export default function BlinkAI() {
  const store = useStore()
  const [prompt, setPrompt] = useState('')
  const [product, setProduct] = useState(null)
  const [productURL, setProductURL] = useState(null)
  const [creator, setCreator] = useState(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  // generation settings
  const [duration, setDuration] = useState(LIMITS.duration.default)
  const [aspect, setAspect] = useState('9:16')
  const [resolution, setResolution] = useState('1080p')

  const [negative, setNegative] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  function onProduct(file) {
    if (!file) return
    setProduct(file)
    setProductURL(URL.createObjectURL(file))
  }

  // Veo's file URI is temporary, so pull the bytes into IndexedDB and keep only
  // metadata in the store — that's what the Library reads back.
  async function archive(media, usedPrompt) {
    const entry = {
      id: uid('blink'),
      kind: media.kind || 'video',
      prompt: usedPrompt,
      creatorId: creator?.id || null,
      creatorName: creator?.name || null,
      durationSeconds: duration,
      aspectRatio: aspect,
      resolution,
      createdAt: Date.now(),
      blobKey: null,
      url: null,
    }
    try {
      const src = media.dataUrl || media.url
      if (!src) return
      const blob = await (await fetch(src)).blob()
      const key = uid('blinkv')
      await putBlob(key, blob)
      entry.blobKey = key
    } catch {
      // couldn't cache it locally — fall back to the remote URI while it lasts
      entry.url = media.dataUrl || media.url || null
    }
    store.saveBlink(entry)
    setSaved(true)
  }

  async function run() {
    if (!prompt.trim() || busy) return
    const usedPrompt = prompt.trim()
    setBusy(true); setError(null); setResult(null); setSaved(false); setStatus('Starting…')
    try {
      const media = await generate(usedPrompt, product, creator, setStatus, {
        durationSeconds: duration,
        aspectRatio: aspect,
        resolution,
        negativePrompt: negative,
      })
      setResult(media)
      setStatus('Saving to your library…')
      await archive(media, usedPrompt)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false); setStatus('')
    }
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

      {!hasKey() && (
        <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginBottom: 18 }}>
          <div className="row"><span className="chip hot">setup</span></div>
          <div className="small mt-2">
            No Google AI key found. Create <span className="mono">reelmint/.env</span> with{' '}
            <span className="mono">VITE_GOOGLE_AI_KEY=your-key</span> and restart the dev server.
          </div>
        </div>
      )}

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
            {/* product */}
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

            {/* creator */}
            {creator ? (
              <div className="row" style={{ gap: 8 }}>
                <img src={creator.img} alt={creator.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }} />
                <span className="chip sea">{creator.name}</span>
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
            <div className="row" style={{ gap: 12 }}>
              <span className="tick" style={{ fontSize: 22 }}>✦</span>
              <div>
                <b>{status || 'Working…'}</b>
                <div className="small muted">Video generation usually takes 1–3 minutes.</div>
              </div>
            </div>
          )}

          {error && (
            <>
              <div className="row"><span className="chip hot">error</span></div>
              <div className="small mt-2">{error}</div>
            </>
          )}

          {result?.kind === 'video' && (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <h4 style={{ color: 'var(--sea)' }}>Your video</h4>
                <a className="btn sm" href={result.dataUrl || result.url} download="blink-ai.mp4">⬇ Download</a>
              </div>
              <video src={result.dataUrl || result.url} controls autoPlay loop playsInline
                style={{ width: aspect === '16:9' ? 460 : 300, borderRadius: 14, display: 'block', border: '1px solid var(--line)' }} />
              <div className="row mt-4 wrap">
                <span className="chip">{duration}s</span>
                <span className="chip">{aspect}</span>
                <span className="chip">{resolution}</span>
                <span className="chip sea">audio</span>
                {saved && (
                  <a className="chip mint" href="#/library" style={{ textDecoration: 'none' }}>
                    saved to library ↗
                  </a>
                )}
              </div>
            </>
          )}

          {result?.kind === 'image' && (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <h4 style={{ color: 'var(--sea)' }}>Your result</h4>
                <a className="btn sm" href={result.dataUrl} download="blink-ai.png">⬇ Download</a>
              </div>
              <img src={result.dataUrl} alt="result" style={{ width: 300, borderRadius: 14, display: 'block', border: '1px solid var(--line)' }} />
            </>
          )}

          {result?.kind === 'text' && (
            <>
              <div className="row"><span className="chip">model replied with text</span></div>
              <div className="small mt-2" style={{ whiteSpace: 'pre-wrap' }}>{result.text}</div>
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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useStore } from '../lib/store.jsx'
import { go } from '../lib/router.js'
import Upsell from '../components/Upsell.jsx'
import { fmtSeconds } from '../lib/multiframe.js'
import { writeAds, takeActorHandoff } from '../lib/ideas.js'
import {
  fetchActorOptions,
  fetchActorUsage,
  listTakes,
  getTake,
  startTake,
  deleteTake,
  TAKE_STATE,
  isRendering,
  spokenSeconds,
} from '../lib/actors.js'

/**
 * AI Actors: pick a face, give it a script, get a creator talking about your
 * product to camera — lip-synced, and holding it if there is a photo of it.
 *
 * The roster is shown to everyone, locked or not. The faces are the pitch:
 * someone deciding whether Studio is worth it should be able to see exactly
 * who would be reading their script.
 */

// Shown before /options answers, and to locked accounts that cannot call it.
const ROSTER = [
  { id: 'cr_casual_girl', name: 'Chloe', vibe: 'Everyday girl, 20s', img: '/creators/casual-girl.jpg', voice: 'Rachel' },
  { id: 'cr_tech_girl', name: 'Nina', vibe: 'Tech girl, 20s', img: '/creators/tech-girl.jpg', voice: 'Aria' },
  { id: 'cr_gym_girl', name: 'Lena', vibe: 'Fitness, 20s', img: '/creators/gym-girl.jpg', voice: 'Sarah' },
  { id: 'cr_business_woman', name: 'Diana', vibe: 'Professional, 30s', img: '/creators/business-woman.jpg', voice: 'Charlotte' },
  { id: 'cr_older_woman', name: 'Susan', vibe: 'Trustworthy, 55+', img: '/creators/older-woman.jpg', voice: 'Charlotte' },
  { id: 'cr_casual_guy', name: 'Sam', vibe: 'Everyday guy, 20s', img: '/creators/casual-guy.jpg', voice: 'Liam' },
  { id: 'cr_tech_guy', name: 'Ethan', vibe: 'Tech guy, 20s', img: '/creators/tech-guy.jpg', voice: 'Will' },
  { id: 'cr_gym_guy', name: 'Jake', vibe: 'Fitness, 20s', img: '/creators/gym-guy.jpg', voice: 'Will' },
  { id: 'cr_dad_guy', name: 'Mike', vibe: 'Dad energy, 40s', img: '/creators/dad-guy.jpg', voice: 'Adam' },
  { id: 'cr_older_man', name: 'Frank', vibe: 'Trustworthy, 60+', img: '/creators/older-man.jpg', voice: 'Brian' },
]

const FALLBACK_VOICES = [
  { id: 'Rachel', name: 'Rachel', blurb: 'warm, conversational' },
  { id: 'Sarah', name: 'Sarah', blurb: 'soft and friendly, younger' },
  { id: 'Aria', name: 'Aria', blurb: 'bright and expressive' },
  { id: 'Charlotte', name: 'Charlotte', blurb: 'calm, measured' },
  { id: 'Adam', name: 'Adam', blurb: 'low, steady, male' },
  { id: 'Brian', name: 'Brian', blurb: 'deep and reassuring, male' },
  { id: 'Liam', name: 'Liam', blurb: 'casual young male' },
  { id: 'Will', name: 'Will', blurb: 'easy, upbeat male' },
]

const MAX_SCRIPT = 900

export default function Actors() {
  const { can } = useAuth()
  const store = useStore()
  const brand = store.state.brand

  const handoff = useMemo(takeActorHandoff, [])

  const [actors, setActors] = useState(ROSTER)
  const [voices, setVoices] = useState(FALLBACK_VOICES)
  const [actorId, setActorId] = useState(ROSTER[0].id)
  const [voice, setVoice] = useState(ROSTER[0].voice)
  const [voiceTouched, setVoiceTouched] = useState(false)
  const [script, setScript] = useState(handoff?.script || '')

  const [productFile, setProductFile] = useState(null)
  const [productPreview, setProductPreview] = useState(null)
  const [productUrl, setProductUrl] = useState(handoff?.productImage || null)
  const [faceFile, setFaceFile] = useState(null)
  const [facePreview, setFacePreview] = useState(null)
  const [consent, setConsent] = useState(false)

  const [takes, setTakes] = useState([])
  const [usage, setUsage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState(null)

  const productRef = useRef(null)
  const faceRef = useRef(null)

  useEffect(() => {
    fetchActorOptions()
      .then((o) => {
        if (o.actors?.length) setActors(o.actors)
        if (o.voices?.length) setVoices(o.voices)
      })
      .catch(() => {})
  }, [])

  const refresh = React.useCallback(async () => {
    if (!can.actors) return
    try {
      const [t, u] = await Promise.all([listTakes(), fetchActorUsage()])
      setTakes(t)
      setUsage(u)
    } catch {
      // The history is a convenience; the composer still works without it.
    }
  }, [can.actors])

  useEffect(() => { refresh() }, [refresh])

  // Poll every take that is still rendering. One request per take every few
  // seconds; each poll is also what collects the finished video server-side.
  const renderingIds = takes.filter((t) => isRendering(t.status)).map((t) => t.id).join(',')
  useEffect(() => {
    if (!renderingIds) return
    const ctrl = new AbortController()
    const tick = async () => {
      for (const id of renderingIds.split(',')) {
        try {
          const t = await getTake(id, { signal: ctrl.signal })
          setTakes((all) => all.map((x) => (x.id === id ? t : x)))
          if (!isRendering(t.status)) fetchActorUsage().then(setUsage).catch(() => {})
        } catch {
          // Next tick.
        }
      }
    }
    const timer = setInterval(tick, 6000)
    tick()
    return () => {
      clearInterval(timer)
      ctrl.abort()
    }
  }, [renderingIds])

  useEffect(() => () => {
    if (productPreview) URL.revokeObjectURL(productPreview)
    if (facePreview) URL.revokeObjectURL(facePreview)
  }, [productPreview, facePreview])

  const custom = actorId === 'custom'
  const actor = actors.find((a) => a.id === actorId)
  const seconds = spokenSeconds(script)
  const affordable = usage ? usage.remainingSeconds >= seconds : true
  const ready = script.trim().length >= 12 && seconds <= 60 && affordable && (!custom || (faceFile && consent))

  function pick(a) {
    setActorId(a.id)
    if (!voiceTouched && a.voice) setVoice(a.voice)
  }

  async function draft() {
    setError(null)
    setDrafting(true)
    try {
      const r = await writeAds({
        product: {
          productName: brand?.appName || 'my product',
          oneLiner: brand?.tagline || '',
          category: brand?.category || '',
          tone: brand?.tone || '',
        },
        angle: script.trim() ? `Rewrite and improve this, keeping its idea: ${script.trim()}` : '',
        framework: 'any',
        length: 'short',
        count: 1,
      })
      if (r.ads?.[0]) setScript(r.ads[0].script)
    } catch (err) {
      setError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  async function generate() {
    setError(null)
    setBusy(true)
    try {
      const take = await startTake({
        actorId,
        script: script.trim(),
        voice,
        brandId: brand?.id,
        productFile,
        productUrl: productFile ? null : productUrl,
        faceFile: custom ? faceFile : null,
        consent,
      })
      setTakes((t) => [take, ...t])
      document.getElementById('takes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    if (!confirm('Delete this take? This cannot be undone.')) return
    setTakes((t) => t.filter((x) => x.id !== id))
    deleteTake(id).catch(() => refresh())
  }

  const head = (
    <div className="page-head">
      <div className="page-kicker">AI Actors</div>
      <h1 className="page-title">Real faces. Your script. <em>No shoot.</em></h1>
      <p className="page-sub">
        Pick a creator, paste what they should say, and get a lip-synced, selfie-style UGC video — holding your
        actual product if you add a photo of it. Or upload a selfie and clone yourself.
      </p>
    </div>
  )

  if (!can.actors) {
    return (
      <div>
        {head}
        <Upsell
          feature="actors"
          pitch="Ten AI creators read any script you write — lip-synced, natural, with your product in their hand. Or turn one selfie of yourself into a talking twin. Every take spends seconds from the same monthly video allowance as Blink AI."
        />
        <div className="ac-roster mt-6 locked">
          {ROSTER.map((a) => (
            <div key={a.id} className="ac-face">
              <img src={a.img} alt={a.name} loading="lazy" />
              <span><b>{a.name}</b>{a.vibe}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {head}

      <div className="ac-layout">
        <div>
          <div className="ai-section-head" style={{ marginTop: 0 }}>
            <h2>1 · Pick your actor</h2>
            <span className="small muted">{actors.length} creators + you</span>
          </div>
          <div className="ac-roster">
            {actors.map((a) => (
              <button key={a.id} className={`ac-face ${actorId === a.id ? 'on' : ''}`} onClick={() => pick(a)} disabled={busy}>
                <img src={a.img} alt={a.name} loading="lazy" />
                <span><b>{a.name}</b>{a.vibe}</span>
              </button>
            ))}
            <button className={`ac-face you ${custom ? 'on' : ''}`} onClick={() => { setActorId('custom'); if (!faceFile) faceRef.current?.click() }} disabled={busy}>
              {facePreview ? <img src={facePreview} alt="you" /> : <div className="ac-you-ico">＋</div>}
              <span><b>You</b>Clone yourself</span>
            </button>
            <input ref={faceRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setFaceFile(f); setFacePreview(URL.createObjectURL(f)); setActorId('custom') }
              e.target.value = ''
            }} />
          </div>

          {custom && (
            <div className="card mt-4 ac-consent">
              <div className="small">
                Use a well-lit, front-facing, vertical photo — like a selfie — with your face and shoulders in frame.
              </div>
              <label className="row mt-2" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
                <span className="small">This is me, or I have the person’s permission to use their likeness in ads.</span>
              </label>
              {faceFile && <button className="btn ghost xs mt-2" onClick={() => faceRef.current?.click()}>Change photo</button>}
            </div>
          )}
        </div>

        <div className="card ac-composer">
          <div className="row between">
            <h2 className="ac-h">2 · What {custom ? 'you say' : `${actor?.name || 'they'} says`}</h2>
            <button className="btn ghost xs" disabled={drafting || busy} onClick={draft}>
              {drafting ? '✦ Writing…' : script.trim() ? '✦ Punch it up' : '✦ Write it for me'}
            </button>
          </div>
          {handoff?.hook && <div className="small muted mt-2">From Ad Ideas: “{handoff.hook}”</div>}
          <textarea
            className="input mt-2"
            style={{ minHeight: 170, fontSize: 15, lineHeight: 1.5 }}
            maxLength={MAX_SCRIPT}
            placeholder="Okay I need to talk about this because nobody told me… "
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={busy}
          />
          <div className="row between small muted mt-2">
            <span>≈ {seconds}s spoken{seconds > 60 && <b style={{ color: 'var(--hot)' }}> — keep it under 60s</b>}</span>
            <span>{script.length}/{MAX_SCRIPT}</span>
          </div>

          <h2 className="ac-h mt-6">3 · Voice</h2>
          <div className="ac-voices">
            {voices.map((v) => (
              <button key={v.id} className={`ac-voice ${voice === v.id ? 'on' : ''}`} disabled={busy}
                onClick={() => { setVoice(v.id); setVoiceTouched(true) }}>
                <b>{v.name}</b><span>{v.blurb}</span>
              </button>
            ))}
          </div>

          <h2 className="ac-h mt-6">4 · Product in hand <span className="small muted" style={{ fontWeight: 400 }}>optional</span></h2>
          <div className="row wrap mt-2" style={{ gap: 10, alignItems: 'center' }}>
            {productPreview || productUrl ? (
              <>
                <img className="ac-product" src={productPreview || productUrl} alt="your product" referrerPolicy="no-referrer" />
                <span className="chip accent">in their hand</span>
                <button className="btn xs" disabled={busy} onClick={() => productRef.current?.click()}>Change</button>
                <button className="btn xs" disabled={busy} onClick={() => { setProductFile(null); setProductPreview(null); setProductUrl(null) }}>Remove</button>
              </>
            ) : (
              <>
                <button className="btn sm" disabled={busy} onClick={() => productRef.current?.click()}>⬆ Upload product photo</button>
                <span className="small muted">They'll hold your real product, unchanged, while they talk.</span>
              </>
            )}
            <input ref={productRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setProductFile(f); setProductPreview(URL.createObjectURL(f)); setProductUrl(null) }
              e.target.value = ''
            }} />
          </div>

          <div className="ac-go">
            <div className="small muted">
              {seconds ? <>This take spends about <b style={{ color: 'var(--paper)' }}>{fmtSeconds(seconds)}</b> of your monthly video.</> : 'Write a script to see what it costs.'}
              {usage && (
                <div style={{ color: affordable ? undefined : 'var(--hot)' }}>
                  {fmtSeconds(usage.remainingSeconds)} of {fmtSeconds(usage.limitSeconds)} left this month
                </div>
              )}
            </div>
            <button className="btn primary" disabled={!ready || busy} onClick={generate}>
              {busy ? '◉ Starting…' : '◉ Film this take'}
            </button>
          </div>
          {custom && !consent && faceFile && <div className="small muted mt-2">Tick the permission box to film with your own face.</div>}
        </div>
      </div>

      {error && (
        <div className="card mt-4" style={{ borderColor: 'rgba(255,122,89,0.35)' }}>
          <div className="row"><span className="chip hot">couldn't film that</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      <div className="ai-section-head" id="takes">
        <h2>Your takes</h2>
        <span className="small muted">Takes render in 2–5 minutes. You can leave this page.</span>
      </div>

      {takes.length === 0 ? (
        <div className="empty">
          No takes yet. Need a script? <a href="#/ideas" onClick={(e) => { e.preventDefault(); go('/ideas') }} style={{ color: 'var(--brand)' }}>Paste your product link into Ad Ideas</a> and send one over.
        </div>
      ) : (
        <div className="ac-takes">
          {takes.map((t) => <Take key={t.id} take={t} onDelete={() => remove(t.id)} />)}
        </div>
      )}
    </div>
  )
}

function Take({ take, onDelete }) {
  const working = isRendering(take.status)
  return (
    <div className="card ac-take">
      <div className="ac-take-media">
        {take.status === 'ready' && take.videoUrl ? (
          <video src={take.videoUrl} controls playsInline preload="metadata" poster={take.faceUrl || undefined} />
        ) : (
          <>
            <img src={take.faceUrl || take.actorImg} alt="" />
            <div className={`ac-take-state ${take.status}`}>
              {working && <span className="tick">◉</span>} {TAKE_STATE[take.status] || take.status}
            </div>
          </>
        )}
      </div>
      <div className="ac-take-body">
        <div className="row between">
          <b>{take.actorName}</b>
          <span className="small muted">{take.durationSeconds ? `${Math.round(take.durationSeconds)}s · ` : ''}{take.voice}</span>
        </div>
        <div className="small muted ac-take-script">{take.script}</div>
        {take.status === 'failed' && <div className="small" style={{ color: 'var(--hot)' }}>{take.error}</div>}
        <div className="row mt-2" style={{ gap: 6 }}>
          {take.status === 'ready' && take.videoUrl && (
            <a className="btn primary xs" href={take.videoUrl} download={`blink-${take.actorName}-${take.id.slice(0, 6)}.mp4`} target="_blank" rel="noreferrer">⬇ Download</a>
          )}
          {!working && <button className="btn ghost xs" onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </div>
  )
}

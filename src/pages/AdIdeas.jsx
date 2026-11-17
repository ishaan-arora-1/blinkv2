import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useStore } from '../lib/store.jsx'
import { go } from '../lib/router.js'
import { planFor } from '../lib/tiers.js'
import { markIdea } from '../lib/entry.js'
import {
  fetchIdeaOptions,
  importProduct,
  writeAds,
  loadWorkspace,
  saveWorkspace,
  sendToActors,
  ideaFromAd,
  copyText,
  takeQueuedLink,
} from '../lib/ideas.js'

/**
 * Ad Ideas: paste a product link, get the strategy and a stack of ads.
 *
 * The first thing a new account should see work, because it is the fastest
 * route from "I signed up" to "this thing understands my product": thirty
 * seconds after pasting a link there is a buyer, their frustrations, six
 * angles and a set of scripts with hooks a media buyer would actually test.
 * Every ad then has two buttons that turn it into a video — which is where
 * the free account meets the plan.
 */

const READING_STEPS = [
  'Opening the page…',
  'Reading the product…',
  'Working out who buys it…',
  'Finding what keeps them up at night…',
  'Mapping six angles…',
]

const WRITING_STEPS = ['Studying the angle…', 'Drafting hooks…', 'Cutting the weak ones…', 'Timing the scripts…']

const FALLBACK_FRAMEWORKS = [
  { id: 'any', name: 'Mix of everything' },
  { id: 'pas', name: 'Problem → agitate → solve' },
  { id: 'testimonial', name: 'Honest testimonial' },
  { id: 'pov', name: 'POV / storytime' },
  { id: 'listicle', name: '3 reasons why' },
  { id: 'us-vs-them', name: 'Us vs. the alternative' },
  { id: 'unboxing', name: 'Unboxing / first look' },
  { id: 'founder', name: 'Founder story' },
  { id: 'controversial', name: 'Hot take' },
]

function useCycle(steps, on) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!on) return setI(0)
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 2600)
    return () => clearInterval(t)
  }, [on, steps.length])
  return steps[i]
}

export default function AdIdeas() {
  const { can } = useAuth()
  const store = useStore()
  const brand = store.state.brand

  const saved = useMemo(loadWorkspace, [])
  const [url, setUrl] = useState(saved?.url || '')
  const [notes, setNotes] = useState(saved?.notes || '')
  const [describe, setDescribe] = useState(Boolean(saved?.notes && !saved?.url))
  const [product, setProduct] = useState(saved?.product || null)
  const [analysis, setAnalysis] = useState(saved?.analysis || null)
  const [ads, setAds] = useState(saved?.ads || [])
  const [starred, setStarred] = useState(saved?.starred || [])
  const [heroImg, setHeroImg] = useState(0)

  const [options, setOptions] = useState(null)
  const [angleId, setAngleId] = useState(saved?.angleId || null)
  const [framework, setFramework] = useState('any')
  const [length, setLength] = useState('medium')
  const [count, setCount] = useState(6)
  const [filter, setFilter] = useState('all')

  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const adsRef = useRef(null)

  const readingLabel = useCycle(READING_STEPS, reading)
  const writingLabel = useCycle(WRITING_STEPS, writing)

  useEffect(() => {
    fetchIdeaOptions().then(setOptions).catch(() => {})
  }, [])

  // A link pasted on the dashboard arrives here to be read straight away.
  // Read once, on mount; the ref stops React's dev double-invoke reading it twice.
  const queuedRef = useRef(false)
  useEffect(() => {
    if (queuedRef.current) return
    queuedRef.current = true
    const queued = takeQueuedLink()
    if (queued) {
      setUrl(queued)
      setDescribe(false)
      read({ link: queued })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveWorkspace({ url, notes, product, analysis, ads, starred, angleId })
  }, [url, notes, product, analysis, ads, starred, angleId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const angle = analysis?.angles?.find((a) => a.id === angleId) || null
  const frameworks = options?.frameworks || FALLBACK_FRAMEWORKS

  async function read({ link } = {}) {
    setError(null)
    setReading(true)
    try {
      const r = await importProduct(link ? { url: link } : { url: describe ? '' : url, notes: describe ? notes : '' })
      setProduct(r.product)
      setAnalysis(r.analysis)
      setAds([])
      setStarred([])
      setAngleId(null)
      setHeroImg(0)
      setOptions((o) => (o ? { ...o, usage: { ...o.usage, import: r.usage } } : o))
      // Straight into the first batch: the strategy is the means, the ads are
      // what they came for, and making them press a second button to see any
      // is a step between them and the moment the product proves itself.
      await write({ product: r.analysis, fresh: true })
    } catch (err) {
      setError(err.message)
      if (err.code === 'link_blocked' || err.code === 'link_timeout' || err.code === 'link_unreachable') setDescribe(true)
    } finally {
      setReading(false)
    }
  }

  async function write({ product: p = analysis, angleOverride, fresh = false } = {}) {
    if (!p) return
    setError(null)
    setWriting(true)
    const a = angleOverride !== undefined ? angleOverride : angle
    try {
      const r = await writeAds({
        product: p,
        angle: a ? `${a.name} — ${a.insight}` : '',
        framework,
        length,
        count,
        avoid: fresh ? [] : ads.map((x) => x.hook),
      })
      const stamped = r.ads.map((x, i) => ({ ...x, id: `${Date.now().toString(36)}-${i}` }))
      setAds((prev) => (fresh ? stamped : [...stamped, ...prev]))
      setOptions((o) => (o ? { ...o, usage: { ...o.usage, write: r.usage } } : o))
      requestAnimationFrame(() => adsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setWriting(false)
    }
  }

  function pickAngle(a) {
    const next = angleId === a.id ? null : a.id
    setAngleId(next)
    if (next) write({ angleOverride: a })
  }

  function film(ad) {
    sendToActors(ad, product?.images?.[0])
    go('/actors')
  }

  function reel(ad) {
    markIdea(ideaFromAd(ad, analysis?.productName || 'the product'))
    go('/blink')
  }

  function useAsBrand() {
    store.setBrand({ appName: analysis.productName, tagline: analysis.oneLiner })
    setToast(`${analysis.productName} is now your brand`)
  }

  function exportCsv() {
    const rows = [['Hook', 'Framework', 'Angle', 'Script', 'On-screen caption', 'Visual', 'CTA', 'Length (s)', 'Score']]
    for (const a of shown) rows.push([a.hook, a.framework, a.angle, a.script, a.caption, a.visual, a.cta, a.seconds, a.score])
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(analysis?.productName || 'ads').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ad-scripts.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  function reset() {
    setProduct(null)
    setAnalysis(null)
    setAds([])
    setStarred([])
    setAngleId(null)
    setError(null)
  }

  const shown = filter === 'starred' ? ads.filter((a) => starred.includes(a.id)) : ads
  const imports = options?.usage?.import
  const writes = options?.usage?.write

  // ── nothing read yet: the one input ──────────────────────────────────────
  if (!analysis) {
    return (
      <div className="ai-page">
        <div className="page-head">
          <div className="page-kicker">Ad Ideas</div>
          <h1 className="page-title">Paste a link. Get a <em>month of ads</em>.</h1>
          <p className="page-sub">
            Your product page in, a creative strategist's work out: who buys it, what they're frustrated by, six
            angles to sell it on, and ready-to-film scripts with hooks built to stop the scroll.
          </p>
        </div>

        <div className="card ai-input">
          {!describe ? (
            <div className="ai-url">
              <span className="ai-url-ico" aria-hidden="true">🔗</span>
              <input
                className="input"
                placeholder="yourshop.com/products/your-best-seller"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && url.trim() && !reading && read()}
                disabled={reading}
                autoFocus
              />
              <button className="btn primary" disabled={!url.trim() || reading} onClick={() => read()}>
                {reading ? '✦ Reading…' : '✦ Write my ads'}
              </button>
            </div>
          ) : (
            <>
              <textarea
                className="input"
                style={{ minHeight: 110 }}
                placeholder="What it is, who it's for, what makes it different, the price… A few sentences is plenty."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={reading}
                autoFocus
              />
              <div className="row between mt-4">
                <span className="small muted">{notes.length}/1500</span>
                <button className="btn primary" disabled={notes.trim().length < 12 || reading} onClick={() => read()}>
                  {reading ? '✦ Reading…' : '✦ Write my ads'}
                </button>
              </div>
            </>
          )}

          <div className="row between mt-4 wrap" style={{ gap: 10 }}>
            <button className="btn ghost xs" disabled={reading} onClick={() => setDescribe((d) => !d)}>
              {describe ? '← Use a link instead' : 'No link? Describe it instead'}
            </button>
            {imports && (
              <span className="small muted">
                {Math.max(0, imports.limit - imports.used)} of {imports.limit} product reads left today
              </span>
            )}
          </div>

          {reading && (
            <div className="ai-working">
              <span className="tick">✦</span> {readingLabel}
            </div>
          )}
        </div>

        {!brand?.appName && !reading && (
          <div className="small muted mt-4">Works with Shopify, WooCommerce, Amazon-style listings, app pages and SaaS sites.</div>
        )}

        {error && <ErrorCard message={error} />}

        <div className="grid cols-3 stack-sm mt-6 ai-promise">
          <div className="card"><b>The buyer, decoded</b><p className="small muted">Personas, pain points, objections and the proof on your own page.</p></div>
          <div className="card"><b>Six angles</b><p className="small muted">Each a different reason to buy — tap one for a batch written to it.</p></div>
          <div className="card"><b>Scripts that film</b><p className="small muted">Hook, script, caption, shot and CTA. One tap sends it to an AI actor.</p></div>
        </div>
      </div>
    )
  }

  // ── the workspace ─────────────────────────────────────────────────────────
  const imgs = product?.images || []
  return (
    <div className="ai-page">
      <div className="page-head row between wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker">Ad Ideas</div>
          <h1 className="page-title">Selling <em>{analysis.productName}</em></h1>
          <p className="page-sub">{analysis.oneLiner}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {brand && brand.appName !== analysis.productName && (
            <button className="btn sm" onClick={useAsBrand}>Use as my brand</button>
          )}
          <button className="btn ghost sm" onClick={reset}>New product</button>
        </div>
      </div>

      <div className="ai-top">
        <div className="card ai-product">
          {imgs.length > 0 ? (
            <>
              <div className="ai-product-img">
                <img src={imgs[heroImg] || imgs[0]} alt={product.name || ''} referrerPolicy="no-referrer" />
              </div>
              {imgs.length > 1 && (
                <div className="ai-thumbs">
                  {imgs.slice(0, 6).map((src, i) => (
                    <button key={src} className={i === heroImg ? 'on' : ''} onClick={() => setHeroImg(i)}>
                      <img src={src} alt="" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="ai-product-img empty-img">✦</div>
          )}
          <div className="mt-4">
            <b>{product?.name || analysis.productName}</b>
            <div className="small muted">
              {analysis.brandName}
              {product?.price ? ` · ${product.currency ? `${product.currency} ` : '$'}${product.price}` : ''}
            </div>
            {product?.url && (
              <a className="small" href={product.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
                {product.site} ↗
              </a>
            )}
          </div>
        </div>

        <div className="card ai-strategy">
          <div className="ai-strat-row">
            <label>Buyer</label>
            <p>{analysis.audience}</p>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {analysis.personas.map((p) => <span key={p} className="chip">{p}</span>)}
            </div>
          </div>
          <div className="grid cols-2 stack-sm" style={{ gap: 18 }}>
            <StratList label="What hurts" items={analysis.painPoints} mark="✕" tone="hot" />
            <StratList label="What changes" items={analysis.benefits} mark="✓" tone="brand" />
            <StratList label="Why they hesitate" items={analysis.objections} mark="?" />
            {analysis.proof.length > 0 && <StratList label="Proof on your page" items={analysis.proof} mark="★" tone="accent" />}
          </div>
          {analysis.tone && <div className="small muted mt-4">Voice: <b style={{ color: 'var(--paper)' }}>{analysis.tone}</b></div>}
        </div>
      </div>

      <div className="ai-section-head">
        <h2>Angles</h2>
        <span className="small muted">Tap one to write a batch on it</span>
      </div>
      <div className="ai-angles">
        {analysis.angles.map((a, i) => (
          <button key={a.id} className={`ai-angle ${angleId === a.id ? 'on' : ''}`} disabled={writing} onClick={() => pickAngle(a)}>
            <span className="ai-angle-n">0{i + 1}</span>
            <b>{a.name}</b>
            <span className="small muted">{a.insight}</span>
            <span className="chip" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>{a.format}</span>
          </button>
        ))}
      </div>

      <div className="card ai-lab" ref={adsRef}>
        <div className="row between wrap" style={{ gap: 14 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip brand">Hook Lab</span>
              {angle && <span className="chip accent">{angle.name}</span>}
            </div>
            <div className="small muted mt-2">
              {ads.length} ad{ads.length === 1 ? '' : 's'} written
              {writes && ` · ${Math.max(0, writes.limit - writes.used)} batches left today`}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <select className="input ai-select" value={framework} onChange={(e) => setFramework(e.target.value)} disabled={writing}>
              {frameworks.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div className="seg">
              {[['short', '15s'], ['medium', '30s'], ['long', '45s']].map(([id, label]) => (
                <button key={id} className={length === id ? 'on' : ''} disabled={writing} onClick={() => setLength(id)}>{label}</button>
              ))}
            </div>
            <div className="seg">
              {[3, 6, 10].map((n) => (
                <button key={n} className={count === n ? 'on' : ''} disabled={writing} onClick={() => setCount(n)}>{n}</button>
              ))}
            </div>
            <button className="btn primary sm" disabled={writing} onClick={() => write()}>
              {writing ? `✦ ${writingLabel}` : ads.length ? `✦ Write ${count} more` : `✦ Write ${count} ads`}
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {ads.length > 0 && (
        <div className="row between wrap mt-6" style={{ gap: 10 }}>
          <div className="seg">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All {ads.length}</button>
            <button className={filter === 'starred' ? 'on' : ''} onClick={() => setFilter('starred')}>★ Saved {starred.length}</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost xs" onClick={() => copyText(shown.map((a) => `${a.hook}\n\n${a.script}\n\nCTA: ${a.cta}`).join('\n\n———\n\n')).then(() => setToast('Copied every script'))}>
              Copy all
            </button>
            <button className="btn ghost xs" onClick={exportCsv}>Download CSV</button>
          </div>
        </div>
      )}

      {writing && !ads.length && (
        <div className="ai-ads mt-4">
          {Array.from({ length: Math.min(count, 6) }).map((_, i) => <div key={i} className="card ai-ad skeleton" />)}
        </div>
      )}

      <div className="ai-ads mt-4">
        {shown.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            starred={starred.includes(ad.id)}
            onStar={() => setStarred((s) => (s.includes(ad.id) ? s.filter((x) => x !== ad.id) : [...s, ad.id]))}
            onCopy={() => copyText(`${ad.hook}\n\n${ad.script}`).then(() => setToast('Script copied'))}
            onFilm={() => film(ad)}
            onReel={() => reel(ad)}
            canActors={can.actors}
            canReel={can.multiframe}
          />
        ))}
      </div>

      {filter === 'starred' && !shown.length && (
        <div className="empty mt-4">Star the ads worth filming and they collect here.</div>
      )}

      {toast && <div className="ai-toast">{toast}</div>}
    </div>
  )
}

function StratList({ label, items, mark, tone }) {
  if (!items?.length) return null
  return (
    <div className="ai-strat-row">
      <label>{label}</label>
      <ul className="ai-list">
        {items.map((t) => (
          <li key={t}><span className={`ai-mark ${tone || ''}`}>{mark}</span>{t}</li>
        ))}
      </ul>
    </div>
  )
}

function AdCard({ ad, starred, onStar, onCopy, onFilm, onReel, canActors, canReel }) {
  const [open, setOpen] = useState(false)
  const scoreTone = ad.score >= 80 ? 'hi' : ad.score >= 65 ? 'mid' : 'lo'
  return (
    <div className="card ai-ad">
      <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="chip">{ad.framework}</span>
          <span className="chip">{ad.seconds}s</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className={`ai-score ${scoreTone}`} title="Predicted hook strength">{ad.score}</span>
          <button className={`ai-star ${starred ? 'on' : ''}`} onClick={onStar} aria-label={starred ? 'Unsave' : 'Save'}>★</button>
        </div>
      </div>

      <div className="ai-hook">“{ad.hook}”</div>
      {ad.caption && <div className="ai-caption">{ad.caption}</div>}

      <div className={`ai-script ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>{ad.script}</div>
      {!open && <button className="btn ghost xs" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Read full script</button>}

      {open && (
        <div className="small muted">
          <div><b style={{ color: 'var(--paper)' }}>Shot:</b> {ad.visual}</div>
          <div className="mt-2"><b style={{ color: 'var(--paper)' }}>CTA:</b> {ad.cta}</div>
        </div>
      )}

      <div className="ai-ad-actions">
        <button className="btn primary sm" onClick={onFilm}>
          ◉ Film with AI actor{!canActors && <span className="lock">{planFor('actors')}</span>}
        </button>
        <button className="btn sm" onClick={onReel}>
          ✦ Blink AI reel{!canReel && <span className="lock">{planFor('multiframe')}</span>}
        </button>
        <button className="btn ghost sm" onClick={onCopy}>Copy</button>
      </div>
    </div>
  )
}

function ErrorCard({ message }) {
  return (
    <div className="card mt-4" style={{ borderColor: 'rgba(255,122,89,0.35)' }}>
      <div className="row"><span className="chip hot">couldn't do that</span></div>
      <div className="small mt-2">{message}</div>
    </div>
  )
}

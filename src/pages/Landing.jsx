import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans } from '../lib/razorpay.js'
import { money } from '../lib/money.js'
import { supabase, isLocalSupabase } from '../lib/supabase.js'
import { enquiryHref, CONTACT_EMAIL } from '../lib/contact.js'
import { FEATURED, OUTPUTS, FINISHED } from '../lib/outputs.js'
import { BLACK_FRIDAY, savingFor } from '../lib/blackfriday.js'
import Logo from '../components/Logo.jsx'
import SignInButton from '../components/SignInButton.jsx'
import OutputWall from '../components/OutputWall.jsx'
import MultiFrameStrip from '../components/MultiFrameStrip.jsx'

/**
 * Scrolls to a section without touching the URL hash.
 *
 * A plain `href="#pricing"` anchor would be read by the hash router as a route
 * called "pricing", so clicking the nav would both fail to navigate and leave a
 * bogus route behind for after sign-in.
 */
function SectionLink({ to, children }) {
  return (
    <button
      type="button"
      onClick={() => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    >
      {children}
    </button>
  )
}

/**
 * Email sign-in, for a local Supabase only.
 *
 * Google OAuth cannot complete against `supabase start`, so without this there
 * is no way into the app on a local stack. isLocalSupabase is derived from the
 * build-time Supabase URL, so this whole component is unreachable — and
 * dropped by the minifier — in any build pointed at a hosted project.
 */
function DevSignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function signIn() {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginTop: 18, maxWidth: 420, borderColor: 'rgba(255,74,28,0.35)' }}>
      <div className="row"><span className="chip accent">local dev only</span></div>
      <div className="small muted mt-2">Google can’t redirect to a local Supabase. Sign in with email instead.</div>
      <div className="field mt-2">
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      </div>
      <div className="field mt-2">
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          onKeyDown={(e) => e.key === 'Enter' && signIn()}
        />
      </div>
      {err && <div className="small mt-2" style={{ color: 'var(--hot)' }}>{err}</div>}
      <button className="btn primary sm mt-2" onClick={signIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </div>
  )
}

/**
 * One of the three hero clips: poster until it is on screen, then playing.
 *
 * Muted and looping by default — three autoplaying soundtracks on arrival is
 * the fastest way to get a tab closed. The sound-on cut is a click away, and
 * only the clicked one unmutes, so they cannot talk over each other.
 */
function HeroClip({ item, active, onPlay }) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return undefined
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          v.preload = 'auto'
          v.play().catch(() => {})
        } else v.pause()
      },
      { rootMargin: '200px' }
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  return (
    <button className={`hv${active ? ' on' : ''}`} onClick={() => onPlay(item)} aria-label={`Play ${item.label} with sound`}>
      <video ref={ref} src={item.src} poster={item.poster} muted loop playsInline preload="none" />
      <span className="hv-tag">{item.label}</span>
      <span className="hv-play" aria-hidden="true">▶</span>
    </button>
  )
}

export default function Landing() {
  const { authError } = useAuth()

  const [plans, setPlans] = useState([])
  const [plansState, setPlansState] = useState('loading')
  const [playing, setPlaying] = useState(null)

  // Prices come from the same table that bills people, so the page cannot
  // advertise an amount checkout would not charge.
  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((r) => {
        if (!alive) return
        setPlans(r.plans || [])
        setPlansState('ready')
      })
      .catch(() => alive && setPlansState('error'))
    return () => {
      alive = false
    }
  }, [])

  // Monthly only on the landing page. The annual toggle was a decision asked
  // for before anyone had decided to buy at all; it lives on /pricing.
  const monthly = plans
    .filter((p) => p.period === 'monthly')
    .sort((a, b) => a.rank - b.rank)

  return (
    <div className="lp lp-v2">
      {BLACK_FRIDAY.on && (
        <div className="bf-bar">
          <b>{BLACK_FRIDAY.label}</b>
          <span>Up to 50% off every plan</span>
          <span className="bf-dot" aria-hidden="true">·</span>
          <span className="bf-ends">{BLACK_FRIDAY.endsNote}</span>
          <SectionLink to="pricing">See the prices →</SectionLink>
        </div>
      )}

      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Logo size={25} />
          <div className="lp-nav-links">
            <SectionLink to="work">Work</SectionLink>
            <SectionLink to="pricing">Pricing</SectionLink>
            <SectionLink to="how">How it works</SectionLink>
          </div>
          <div className="spacer" />
          <SignInButton label="Log in" className="btn primary sm" />
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="v2-hero">
        <div className="lp-wrap v2-hero-inner">
          <div className="v2-hero-copy">
            <span className="chip brand">One photo in. A finished ad out.</span>
            <h1>
              Ads that look<br />
              <em>shot</em>, not generated.
            </h1>
            <p>
              Upload your product. Blink writes the script, draws every frame, films each one,
              reads it aloud and burns in the subtitles — a finished, posted-ready ad in minutes,
              not a shoot.
            </p>
            <div className="v2-cta">
              <SignInButton label="Make your first ad" className="btn primary lg" />
              <span className="v2-cta-note">No card to start · First ad in under 10 minutes</span>
            </div>
            {isLocalSupabase && <DevSignIn />}
            {authError && (
              <div className="card" style={{ borderColor: 'rgba(255,74,28,0.4)', marginTop: 22, maxWidth: 460 }}>
                <div className="row"><span className="chip hot">sign-in failed</span></div>
                <div className="small mt-2">{authError}</div>
              </div>
            )}
          </div>

          <div className="v2-hero-reel">
            {FEATURED.map((f) => (
              <HeroClip key={f.id} item={f} active={playing?.id === f.id} onPlay={setPlaying} />
            ))}
          </div>
        </div>
      </header>

      {/* ── The work ── */}
      {/* Outputs before argument. Everything this page claims is a thing the
          reader can watch, so the watching comes first and the claims come
          after, where they read as captions rather than promises. */}
      <section className="lp-section v2-work" id="work">
        <div className="lp-wrap">
          <div className="v2-head">
            <h2>Real output. <em>Nothing staged.</em></h2>
            <p>Product heroes, creators to camera, campaign film. Every frame made with Blink.</p>
          </div>
        </div>
        <OutputWall items={OUTPUTS} />
        <div className="lp-wrap v2-finished">
          {FINISHED.map((f) => (
            <figure className="v2-fin" key={f.id}>
              <video src={f.src} poster={f.poster} controls playsInline preload="none" />
              <figcaption>
                <b>{f.label}</b>
                <span>{f.seconds}s · written, voiced and subtitled by Blink</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Pricing, early ── */}
      {/* Up here rather than at the end: somebody who has just watched two
          dozen finished ads is at the top of their intent, and a price is the
          next thing they want. Burying it under the explanation asks them to
          read the manual before they are allowed to know what it costs. */}
      <section className="lp-section v2-pricing" id="pricing">
        <div className="lp-wrap">
          <div className="v2-head center">
            {BLACK_FRIDAY.on && <div className="v2-kicker">{BLACK_FRIDAY.label} · {BLACK_FRIDAY.endsNote}</div>}
            <h2>Pick a plan. <em>Cancel whenever.</em></h2>
            <p>Every plan includes unlimited Instagram posts and the full creator library.</p>
          </div>

          {plansState === 'ready' && monthly.length > 0 ? (
            <div className="lp-plans">
              {monthly.map((plan) => {
                const sale = savingFor(plan.tier, plan.price)
                return (
                  <div key={plan.id} className={`card plan ${plan.tier === 'studio' ? 'featured' : ''}`}>
                    {plan.tier === 'studio' && <span className="plan-flag">Most popular</span>}
                    <h3>{plan.name}</h3>
                    <div className="plan-price">
                      {sale && <s>{money(sale.was, plan.currency)}</s>}
                      {money(plan.price, plan.currency)}
                      <span className="small muted"> /month</span>
                    </div>
                    {sale && <div className="plan-save">Save {sale.off}% — {BLACK_FRIDAY.label}</div>}
                    <p className="small muted plan-blurb">{plan.blurb}</p>
                    <ul className="plan-features">
                      {(plan.features || []).map((f) => (
                        <li key={f} className={/blink ai/i.test(f) ? 'key' : undefined}>
                          <span className="tickmark">✓</span>{f}
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 'auto' }}>
                      <SignInButton
                        label={`Get ${plan.name}`}
                        className={`btn ${plan.tier === 'studio' ? 'primary' : ''}`}
                        intent={plan.tier}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty" style={{ maxWidth: 560, margin: '0 auto' }}>
              {plansState === 'loading' ? <span className="tick">Loading plans…</span> : <b>Sign in to see the plans.</b>}
            </div>
          )}

          <div className="v2-price-foot">
            Need more than Agency, or an annual invoice?{' '}
            <a href={enquiryHref('a custom plan')}>Talk to us</a>.
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-section v2-how" id="how">
        <div className="lp-wrap">
          <div className="v2-head center">
            <h2>Three steps. <em>One sitting.</em></h2>
          </div>
          <div className="v2-steps">
            <div><span>01</span><b>Upload your product</b><p>One photo and a sentence about the ad you want. That is your half of it.</p></div>
            <div><span>02</span><b>Blink makes it</b><p>Scenes planned, every frame drawn, each one filmed, script written, read aloud, subtitles burned in.</p></div>
            <div><span>03</span><b>Post it</b><p>1080 × 1920 for Reels, TikTok and Shorts. 1080 × 1350 for the feed. Yours to download.</p></div>
          </div>
        </div>
      </section>

      {/* ── Proof: one generation, every stage ── */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="v2-head center">
            <div className="v2-kicker">One real run</div>
            <h2>Five frames. One person. <em>One&nbsp;video.</em></h2>
            <p>Every stage of a single generation, in the order it was cut. Point at a scene to play it.</p>
          </div>
          <MultiFrameStrip />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section v2-faq-sec" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="v2-head center"><h2>Before you <em>start</em>.</h2></div>
          <div className="lp-faq">
            <details>
              <summary>Does it actually look real?</summary>
              <p>
                Judge the wall above rather than take our word for it — every clip on this page came
                out of Blink. Frames are prompted against the specific things that give generated
                footage away, and each scene is drawn from the first, so the same person stays in the
                same room across a cut.
              </p>
            </details>
            <details>
              <summary>What do I need to give it?</summary>
              <p>
                One photo of your product and one sentence. A better photo is reproduced more
                exactly, and that is the only lever that really matters.
              </p>
            </details>
            <details>
              <summary>What if it gets a scene wrong?</summary>
              <p>
                You see every frame before a second of video is paid for, and you can redraw any of
                them by typing what to change.
              </p>
            </details>
            <details>
              <summary>Is the Black Friday price locked in?</summary>
              <p>
                Your rate stays at the price you sign up on for as long as the subscription runs.
                It returns to full price for new customers on 1 December.
              </p>
            </details>
            <details>
              <summary>Can I cancel?</summary>
              <p>Any time, from your account. You keep everything you made.</p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Closing ── */}
      <div className="lp-wrap">
        <div className="v2-final">
          <h2>Your product, in an ad, <em>tonight</em>.</h2>
          <div className="v2-cta center">
            <SignInButton label="Make your first ad" className="btn primary lg" />
            <span className="v2-cta-note">{BLACK_FRIDAY.on ? `${BLACK_FRIDAY.label} — up to 50% off` : 'No card to start'}</span>
          </div>
        </div>

        <footer className="lp-footer">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Blink UGC</span>
          <a href="/privacy" style={{ color: 'inherit' }}>Privacy</a>
          <a href="/terms" style={{ color: 'inherit' }}>Terms</a>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>
        </footer>
      </div>

      {playing && (
        <div className="v2-modal" onClick={() => setPlaying(null)} role="dialog" aria-label={`${playing.label} with sound`}>
          <video src={playing.hd || playing.src} poster={playing.poster} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          <button className="v2-modal-x" onClick={() => setPlaying(null)} aria-label="Close">✕</button>
        </div>
      )}
    </div>
  )
}

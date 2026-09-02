import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans } from '../lib/razorpay.js'
import { money, perMonth } from '../lib/money.js'
import { CREATORS, getCreator } from '../lib/creators.js'
import { builtinSets, isGradientRef } from '../lib/library.js'
import { SHOWCASE, ANIMATED_SHOWCASE } from '../lib/showcase.js'
import { CHARACTERS } from '../lib/characters.js'
import { supabase, isLocalSupabase } from '../lib/supabase.js'
import { BLINK_TEMPLATES } from '../lib/blinkTemplates.js'
import { enquiryHref, CONTACT_EMAIL } from '../lib/contact.js'
import Logo from '../components/Logo.jsx'
import HookPreview from '../components/HookPreview.jsx'
import ReelGraph from '../components/ReelGraph.jsx'
import SlidePreview from '../components/SlidePreview.jsx'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2C29.1 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C39.9 34.9 44 30 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

/*
 * Five of the ten, chosen to look like a roster rather than a type: two men,
 * three women, and an age range. Five is a strip you read in one glance; ten is
 * a grid, and this is not the feature that earns a grid.
 */
const ROSTER = ['cr_tech_girl', 'cr_gym_guy', 'cr_older_woman', 'cr_casual_guy', 'cr_business_woman']

// The creator whose reaction fronts the hook-video breakdown, and the frame
// standing in for the footage cut in behind it. A different face from the
// hero's, so the two are not the same clip twice.
const ANATOMY_CREATOR = 'cr_tech_girl'
const ANATOMY_SHOT = '/sets/thumbs/girl/04.jpg'

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
      onClick={() =>
        document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    >
      {children}
    </button>
  )
}

function SignInButton({ label = 'Continue with Google', className = 'btn google' }) {
  const { signInWithGoogle, signingIn } = useAuth()
  return (
    <button className={className} onClick={signInWithGoogle} disabled={signingIn}>
      <GoogleMark />
      {signingIn ? 'Opening Google…' : label}
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
  // Blank rather than prefilled. The seeded credentials live in
  // supabase/seed-local.mjs, which never reaches a browser; baking them in here
  // put a working-looking password into every bundle that shipped this file.
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState(null)

  async function signIn() {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginTop: 18, maxWidth: 420, borderColor: 'rgba(243,164,230,0.35)' }}>
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

export default function Landing() {
  const { authError } = useAuth()

  const [plans, setPlans] = useState([])
  const [period, setPeriod] = useState('monthly')
  const [plansState, setPlansState] = useState('loading')

  // The prices come from the same table that bills people, so the page cannot
  // quietly advertise an amount checkout would not charge. A failure here must
  // never block sign-up, so the section degrades to a plain trial line.
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

  const monthly = plans.filter((p) => p.period === 'monthly')
  const cheapest = monthly.length ? monthly.reduce((a, b) => (a.price <= b.price ? a : b)) : null
  const periods = [...new Set(plans.map((p) => p.period))].sort((a, b) => (a === 'monthly' ? -1 : 1))
  // One card per tier, always. If a tier has no plan for the selected period —
  // Agency has no annual while Razorpay's transaction limit blocks the $1,290
  // charge — it falls back to its monthly plan rather than vanishing from the
  // page the moment someone flips to Yearly, which reads as the page being
  // broken rather than as the plan being monthly-only.
  const shownPlans = [...new Set(plans.map((p) => p.tier))]
    .map(
      (t) =>
        plans.find((p) => p.tier === t && p.period === period) ||
        plans.find((p) => p.tier === t && p.period === 'monthly')
    )
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)

  const bestSaving = Math.max(
    0,
    ...plans
      .filter((p) => p.period === 'yearly')
      .map((p) => {
        const twin = plans.find((m) => m.tier === p.tier && m.period === 'monthly')
        return twin ? Math.round((1 - p.price / (twin.price * 12)) * 100) : 0
      })
  )

  const photoSets = builtinSets().filter((s) => !s.images.some(isGradientRef))

  const roster = ROSTER.map(getCreator).filter(Boolean)
  const anatomyCreator = getCreator(ANATOMY_CREATOR)

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Logo size={25} />
          <div className="lp-nav-links">
            <SectionLink to="blink">Blink AI</SectionLink>
            <SectionLink to="creators">Hook videos</SectionLink>
            <SectionLink to="carousels">Carousels</SectionLink>
            <SectionLink to="pricing">Pricing</SectionLink>
          </div>
          <div className="spacer" />
          <SignInButton label="Start free" className="btn primary sm" />
        </div>
      </nav>

      <div className="lp-wrap">
        {/* ── Hero ── */}
        <header className="lp-hero">
          <div>
            <span className="chip brand">one prompt in, a finished ad out</span>
            <h1>
              One prompt. <em>A&nbsp;whole&nbsp;ad.</em>
            </h1>
            <p className="lp-lede">
              Upload your product, write one line. Blink AI plans the scenes, draws every frame, films
              each one, writes the script, reads it aloud and burns in the subtitles — up to 48 seconds
              of finished ad, ready to post. You do neither the storyboard nor the edit.
            </p>
            <div className="lp-cta">
              <SignInButton />
              <div className="lp-trust">
                <b>Photo carousels are free</b>, forever, no card.
                {cheapest && <> Blink AI and the rest from {money(cheapest.price, cheapest.currency)}/month. Cancel anytime.</>}
              </div>
              {isLocalSupabase && <DevSignIn />}
            </div>

            {authError && (
              <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginTop: 22, maxWidth: 460 }}>
                <div className="row"><span className="chip hot">sign-in failed</span></div>
                <div className="small mt-2">{authError}</div>
              </div>
            )}
          </div>

          {/* Real Blink AI generations, not premade creator hooks — see
              blinkTemplates.js. Deliberately not captioned as three scenes of
              one reel: they are unrelated clips, and the thing this page is
              selling is that a real reel holds one person across its scenes.
              Faking that in the hero would be selling the exact claim with the
              exact evidence that does not support it. */}
          <div className="lp-wall narrow" aria-label="Videos generated with Blink AI">
            {BLINK_TEMPLATES.map((t) => (
              <HookPreview key={t.id} hook={t} alt={`Blink AI — ${t.name}`} eager={t === BLINK_TEMPLATES[1]} />
            ))}
          </div>
        </header>
      </div>

      <div className="lp-wrap">
        <div className="lp-strip">
          <span><b>up to 48s</b> finished videos</span>
          <span><b>6</b> scenes per video</span>
          <span><b>8</b> narrator voices</span>
          <span><b>{CREATORS.length}</b> AI creators</span>
          <span><b>{photoSets.length * 10}</b> photo backgrounds</span>
          <span><b>{CHARACTERS.length}</b> 3D characters</span>
          <span>1080 × 1920 &amp; 1080 × 1350 exports</span>
        </div>
      </div>

      {/* ── Blink AI: the reason to buy ── */}
      <section className="lp-section" id="blink">
        <div className="lp-wrap">
          <div className="lp-sec-head center">
            <div className="lp-kicker">Blink AI</div>
            <h2>
              One prompt, <em>start to finish</em>.
            </h2>
            <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              Upload your product, write one line. That is your half of it.
            </p>
          </div>

          {/* The deal, stated before the graph proves it: two things in, seven
              out. The list is short on purpose — every item is a job somebody
              would otherwise be paying a person to do. */}
          <div className="lp-deal">
            <div className="lp-deal-you">
              <span className="lp-deal-k">you bring</span>
              <b>A photo of your product</b>
              <b>One sentence about the video</b>
            </div>

            <span className="lp-deal-arrow" aria-hidden="true">→</span>

            <div className="lp-deal-it">
              <span className="lp-deal-k">Blink AI does the rest, on its own</span>
              <ul>
                <li>Splits it into scenes</li>
                <li>Draws every frame</li>
                <li>Films each frame</li>
                <li>Cuts them together</li>
                <li>Writes the script</li>
                <li>Reads it aloud</li>
                <li>Burns in the subtitles</li>
              </ul>
            </div>
          </div>

          <ReelGraph />

          <div className="rg-foot">
            <span className="chip brand">one real generation</span>
            <span>
              Every frame, clip and word above came out of that one prompt. Play the ad.
            </span>
            <SignInButton label="Make one of your own" className="btn primary sm" />
          </div>
        </div>
      </section>

      {/* ── Hook videos ── */}
      {/* The creator roster and the anatomy of a cut used to be two sections
          between them running most of a screen each. They are one feature and a
          smaller one than Blink AI, so they are one section, and the kicker
          says out loud that this is a different tool rather than more of the
          last one. */}
      <section className="lp-section" id="creators" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-split">
            <div>
              <div className="lp-kicker">A second, smaller feature · Hook videos</div>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.1 }}>
                Or open on a face, and cut to <em>your own demo</em>.
              </h2>
              <p className="muted" style={{ marginTop: 14, fontSize: 15 }}>
                Nothing is generated here. Pick a premade reaction, upload the clip you already
                have — a screen recording, the product on a table — and Blink joins them, writes
                the captions and exports at 1080 × 1920.
              </p>

              <div className="lp-mini-roster">
                {roster.map((c) => (
                  <img key={c.id} src={c.img} alt={c.name} loading="lazy" />
                ))}
                <span>
                  <b>{CREATORS.length} creators</b>, two reactions each
                </span>
              </div>
            </div>

            {/* The shape of the format, which is the whole thing worth saying
                about it. */}
            <div className="lp-anatomy">
              <div className="lp-anatomy-cards">
                <figure>
                  <HookPreview
                    hook={anatomyCreator?.hooks[0]}
                    fallbackImg={anatomyCreator?.img}
                    alt={`${anatomyCreator?.name} reacting`}
                  />
                  <figcaption><b>0:00</b> their reaction</figcaption>
                </figure>
                <div className="lp-anatomy-cut" aria-hidden="true">
                  <span>cut</span>
                </div>
                <figure>
                  <div
                    className="lp-anatomy-shot"
                    style={{ backgroundImage: `url("${ANATOMY_SHOT}")` }}
                    role="img"
                    aria-label="Your own demo footage"
                  />
                  <figcaption><b>0:03</b> your demo</figcaption>
                </figure>
              </div>

              <div className="lp-track" aria-hidden="true">
                <div className="lp-track-row">
                  <span className="lp-seg hook">hook · 3s</span>
                  <span className="lp-seg yours">your demo</span>
                </div>
                <div className="lp-track-row">
                  <span className="lp-seg text">captions</span>
                  <span className="lp-seg music">♪ music</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Carousels ── */}
      {/* Three sections became one. The copy-angle wall, the character roster
          and the custom-set panel were all depth on the smallest of the three
          features, and they pushed Blink AI's evidence a screen and a half
          further up the page than it deserved to be. Animated leads, because it
          is the one nobody else does; photo follows as the free one. */}
      <section className="lp-section" id="carousels" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <div className="lp-kicker">A third, smaller feature · Carousels</div>
            <h2>
              Slides that are <em>drawn</em>, not stocked.
            </h2>
            <p>
              Say what the carousel is about and pick one of {CHARACTERS.length} characters. Blink
              writes the copy and draws every slide around it — the same character throughout, doing
              something different on each one. Three to eight slides, 1080 × 1350.
            </p>
          </div>

          <div className="lp-showcase">
            {ANIMATED_SHOWCASE.map((c) => (
              <figure className="lp-show" key={c.id}>
                <div className="lp-show-slides">
                  {c.slides.map((s, i) => (
                    <SlidePreview key={i} slide={s} alt={`${c.name} — slide ${i + 1}`} />
                  ))}
                </div>
                <figcaption className="lp-show-body">
                  <div className="row between">
                    <b style={{ fontSize: 13.5 }}>{c.name}</b>
                    <span className="chip">{c.character}</span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Photo carousels: the free tier, and the reason anyone signs up
              without a card. Shown at half the size because they are the plain
              version of the thing above. */}
          <div className="lp-alt">
            <div className="lp-alt-copy">
              <span className="chip brand">free forever</span>
              <b>Or lay your copy over photography.</b>
              <span>
                {photoSets.length} built-in collections, or upload your own product shots into a
                named set. Unlimited, no card.
              </span>
            </div>
            <div className="lp-showcase compact">
              {SHOWCASE.map((c) => (
                <figure className="lp-show" key={c.id}>
                  <div className="lp-show-slides">
                    {c.slides.map((s, i) => (
                      <SlidePreview
                        key={i}
                        slide={s}
                        style={{ '--pill-accent': c.accent }}
                        alt={`${c.name} — slide ${i + 1}`}
                      />
                    ))}
                  </div>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Blink AI ── */}
      {/* ── How it works ── */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head center">
            <div className="lp-kicker">How it works</div>
            <h2>
              Three steps, <em>one</em> sitting.
            </h2>
          </div>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-n">STEP 01</div>
              <h3>Tell us about the product</h3>
              <p>
                Name, category, one-line pitch, the verb your customer cares about, and a tone. That
                profile is what every hook, slide and caption is written from.
              </p>
            </div>
            <div className="lp-step">
              <div className="lp-step-n">STEP 02</div>
              <h3>Generate, then art-direct</h3>
              <p>
                Describe a Blink AI video, or mint a carousel or hook video in one click — then make it
                yours: redraw a scene, reshuffle backgrounds, drag text, swap the creator.
              </p>
            </div>
            <div className="lp-step">
              <div className="lp-step-n">STEP 03</div>
              <h3>Export and post</h3>
              <p>
                Slides at 1080 × 1350 for Instagram, video at 1080 × 1920 for Reels, TikTok and
                Shorts. Everything you make is saved and waiting when you come back.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-section" id="pricing" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head center">
            <div className="lp-kicker">Pricing</div>
            <h2>
              Free where it's free. Paid where it <em>renders</em>.
            </h2>
            <p>
              Photo carousels cost nothing and always will — no card, no countdown, no day eight where
              it stops working. Creator adds unlimited hook videos and animated carousels. Studio and
              Agency add Blink AI: multi-scene video, one voiceover, subtitles — two minutes a month or
              six. Annual is two months free. Change or cancel whenever you like.
            </p>
          </div>

          {periods.length > 1 && (
            <div className="row" style={{ justifyContent: 'center', marginBottom: 24 }}>
              <div className="seg">
                {periods.map((p) => (
                  <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
                    {p === 'yearly' ? 'Yearly' : 'Monthly'}
                    {p === 'yearly' && bestSaving > 0 && <span className="save-pill">save {bestSaving}%</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {plansState === 'ready' && shownPlans.length > 0 ? (
            <div className="lp-plans">
              {/* Hardcoded, unlike the two beside it. The free tier is not a row
                  in the plans table — nothing bills for it, nothing in Razorpay
                  corresponds to it — so there is nothing to read it from. It is
                  the absence of a subscription, described. */}
              <div className="card plan">
                <h3 style={{ fontSize: 20 }}>Free</h3>
                <div className="plan-price">
                  {money(0, shownPlans[0].currency)}
                  <span className="small muted"> /forever</span>
                </div>
                <p className="small muted" style={{ minHeight: 38, marginTop: 8 }}>
                  Photo carousels, unlimited, no card.
                </p>
                <ul className="plan-features">
                  <li><span className="tickmark">✓</span>Unlimited photo carousels</li>
                  <li><span className="tickmark">✓</span>Copy written from your brand and pitch</li>
                  <li><span className="tickmark">✓</span>Five built-in photography collections</li>
                  <li><span className="tickmark">✓</span>1080 × 1350 PNG and ZIP export</li>
                  <li><span className="tickmark">✓</span>Cloud sync across devices</li>
                </ul>
                <div style={{ marginTop: 18 }}>
                  <SignInButton label="Start free" className="btn" />
                </div>
              </div>

              {shownPlans.map((plan) => {
                const twin = plans.find((p) => p.tier === plan.tier && p.period === 'monthly')
                // No annual for this tier — an enquiry, not a purchase.
                const enquiry = period === 'yearly' && plan.period === 'monthly'
                const saving =
                  plan.period === 'yearly' && twin
                    ? Math.round((1 - plan.price / (twin.price * 12)) * 100)
                    : 0
                return (
                  <div key={plan.id} className={`card plan ${plan.tier === 'studio' ? 'featured' : ''}`}>
                    {plan.tier === 'studio' && <span className="plan-flag">Most popular</span>}
                    <h3 style={{ fontSize: 20 }}>{plan.name}</h3>
                    {enquiry ? (
                      <>
                        <div className="plan-price">Let's talk</div>
                        <div className="small muted" style={{ marginTop: -2 }}>
                          Annual and custom plans, billed to suit you
                        </div>
                      </>
                    ) : (
                      <div className="plan-price">
                        {money(plan.price, plan.currency)}
                        <span className="small muted"> /{plan.period === 'yearly' ? 'year' : 'month'}</span>
                      </div>
                    )}
                    {plan.period === 'yearly' && twin && (
                      <div className="small muted" style={{ marginTop: -2 }}>
                        {perMonth(plan.price, plan.currency)}/month, billed yearly
                        {saving > 0 && <> — <b style={{ color: 'var(--brand)' }}>save {saving}%</b></>}
                      </div>
                    )}
                    <p className="small muted" style={{ minHeight: 38, marginTop: 8 }}>
                      {enquiry
                        ? 'Everything in Agency, on an annual invoice — plus custom allowances if you need more than six minutes a month.'
                        : plan.blurb}
                    </p>
                    <ul className="plan-features">
                      {(plan.features || []).map((f) => (
                        <li key={f}><span className="tickmark">✓</span>{f}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 18 }}>
                      {enquiry ? (
                        <a className="btn" style={{ width: '100%', justifyContent: 'center' }} href={enquiryHref(plan.name)}>
                          Contact us
                        </a>
                      ) : (
                        <SignInButton
                          label={`Get ${plan.name}`}
                          className={`btn ${plan.tier === 'studio' ? 'primary' : ''}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Prices are unavailable, not unknown — the free tier is the offer
            // either way, so the section still converts.
            <div className="empty" style={{ maxWidth: 560, margin: '0 auto' }}>
              {plansState === 'loading' ? (
                <span className="tick">Loading plans…</span>
              ) : (
                <>
                  <b>Photo carousels are free, no card.</b>
                  <div className="small mt-2">Sign in to see the paid plans.</div>
                </>
              )}
            </div>
          )}

          <div className="small muted" style={{ textAlign: 'center', marginTop: 22 }}>
            Payments are handled by Razorpay — Blink UGC never sees your card.
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head center">
            <div className="lp-kicker">Questions</div>
            <h2>Before you <em>start</em>.</h2>
          </div>
          <div className="small muted" style={{ textAlign: 'center', marginTop: 22 }}>
            Need more than six minutes a month, an annual invoice, or something shaped differently?{' '}
            <a href={enquiryHref('a custom plan')} style={{ color: 'var(--brand)' }}>Talk to us</a> —
            we'll build a plan around it.
          </div>

          <div className="lp-faq">
            <details>
              <summary>Does this only work for apps?</summary>
              <p>
                No. Blink markets products — physical goods, storefronts, B2B software, apps,
                anything you can photograph or record. You pick your category during setup and every
                hook, slide and CTA is written for that, with no app-store language unless you want it.
              </p>
            </details>
            <details>
              <summary>Are the creators real people?</summary>
              <p>
                They're AI-generated creators, consistent across every clip, so the same face can front
                a whole campaign. No casting, no usage rights to renew, no reshoots when your pitch
                changes.
              </p>
            </details>
            <details>
              <summary>What's the difference between a photo and an animated carousel?</summary>
              <p>
                Where the pictures come from. A photo carousel lays your copy over photography —
                ours or your own — and is free and instant. An animated one has no photography in
                it: you pick a 3D character and every slide is drawn to order, with that same
                character doing something that matches the words on that slide. Both open in the
                same editor and export the same way. Animated carousels are on Creator, because
                each slide is an image somebody bills us to render.
              </p>
            </details>
            <details>
              <summary>What do I need to supply?</summary>
              <p>
                For carousels, nothing but your product details — the photography comes from our sets,
                or upload your own. For hook videos, one screen recording or clip of your product. Blink
                handles the hook, the captions, the music and the export.
              </p>
            </details>
            <details>
              <summary>What do the exports look like?</summary>
              <p>
                Carousel slides export as PNGs at 1080 × 1350, sized for an Instagram carousel. Videos
                export at 1080 × 1920 for Reels, TikTok and Shorts. Blink AI can also render 16:9.
              </p>
            </details>
            <details>
              <summary>What's actually free, and for how long?</summary>
              <p>
                Photo carousels — unlimited, over our built-in photography, with the copy written from
                your brand. No card, no countdown. Hook videos, animated carousels and your own image
                sets are on Creator. Blink AI is on Studio and Agency, with two or six minutes of
                finished video a month, because every second of it renders on hardware somebody bills
                us for. If you cancel later you drop back to free and keep everything you made.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <div className="lp-wrap">
        <div className="lp-final">
          <h2>
            Post something <em>worth</em> stopping for.
          </h2>
          <p className="muted" style={{ marginTop: 16, maxWidth: '48ch', marginLeft: 'auto', marginRight: 'auto' }}>
            Set up your product in a minute, and have your first carousel before you finish your
            coffee. That part costs nothing.
          </p>
          <div className="lp-cta">
            <SignInButton />
            <div className="lp-trust">
              <b>Photo carousels free</b>, no card.
              {cheapest && <> The rest from {money(cheapest.price, cheapest.currency)}/month.</>}
            </div>
          </div>
        </div>

        <footer className="lp-footer">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Blink UGC. Made for people who ship.</span>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>
        </footer>
      </div>
    </div>
  )
}

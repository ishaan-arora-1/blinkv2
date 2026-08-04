import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans } from '../lib/razorpay.js'
import { money, perMonth } from '../lib/money.js'
import { CREATORS } from '../lib/creators.js'
import { builtinSets, isGradientRef } from '../lib/library.js'
import { presetOptions } from '../lib/copygen.js'
import Logo from '../components/Logo.jsx'
import HookPreview from '../components/HookPreview.jsx'

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

/**
 * The copy angles are rendered from the real generator rather than written out
 * by hand, so the examples on the page are literally what a new account gets.
 * If the presets change, this section changes with them.
 */
const DEMO_BRAND = {
  appName: 'Aurelia',
  category: 'skincare',
  verb: 'stick to a routine',
  tagline: 'The three-step routine you will actually finish.',
}

// Five faces for the hero, chosen to look like a roster rather than a type.
const WALL = ['cr_tech_girl', 'cr_gym_guy', 'cr_casual_girl', 'cr_business_woman', 'cr_dad_guy']

// The landing page shows the 360×450 thumbnails, not the full-resolution set
// images those paths normally point at. Ten 450 KB photographs per set is the
// right weight for an export and the wrong weight for a first visit.
const thumbOf = (path) => path.replace('/sets/', '/sets/thumbs/')

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
  const shownPlans = plans.filter((p) => p.period === period)

  const bestSaving = Math.max(
    0,
    ...plans
      .filter((p) => p.period === 'yearly')
      .map((p) => {
        const twin = plans.find((m) => m.tier === p.tier && m.period === 'monthly')
        return twin ? Math.round((1 - p.price / (twin.price * 12)) * 100) : 0
      })
  )

  const sets = builtinSets()
  const photoSets = sets.filter((s) => !s.images.some(isGradientRef))
  const gradientSet = sets.find((s) => s.images.some(isGradientRef))
  const angles = presetOptions(DEMO_BRAND)
  const wall = WALL.map((id) => CREATORS.find((c) => c.id === id)).filter(Boolean)

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Logo size={25} />
          <div className="lp-nav-links">
            <SectionLink to="creators">AI creators</SectionLink>
            <SectionLink to="carousels">Carousels</SectionLink>
            <SectionLink to="blink">Blink AI</SectionLink>
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
            <span className="chip brand">UGC studio for your product</span>
            <h1>
              Your product deserves <em>louder</em> marketing.
            </h1>
            <p className="lp-lede">
              AI creators who deliver your hook on camera. Photo carousels written from your pitch.
              Prompt-to-video when you need something that doesn't exist yet. Everything designed,
              written and exported in minutes — no shoot, no agency, no editor.
            </p>
            <div className="lp-cta">
              <SignInButton />
              <div className="lp-trust">
                <b>Free for 7 days</b>, no card.
                {cheapest && <> Then from {money(cheapest.price, cheapest.currency)}/month. Cancel anytime.</>}
              </div>
            </div>

            {authError && (
              <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginTop: 22, maxWidth: 460 }}>
                <div className="row"><span className="chip hot">sign-in failed</span></div>
                <div className="small mt-2">{authError}</div>
              </div>
            )}
          </div>

          <div className="lp-wall" aria-label="AI creator hook previews">
            {wall.map((c) => (
              <HookPreview key={c.id} hook={c.hooks[0]} fallbackImg={c.img} alt={`${c.name} — ${c.vibe}`} />
            ))}
          </div>
        </header>
      </div>

      <div className="lp-wrap">
        <div className="lp-strip">
          <span><b>{CREATORS.length}</b> AI creators</span>
          <span><b>{CREATORS.reduce((n, c) => n + c.hooks.length, 0)}</b> hook reactions</span>
          <span><b>{photoSets.length * 10}</b> photo backgrounds</span>
          <span><b>{angles.length}</b> copy angles</span>
          <span>1080 × 1920 &amp; 1080 × 1350 exports</span>
        </div>
      </div>

      {/* ── AI creators ── */}
      <section className="lp-section" id="creators">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <div className="lp-kicker">AI creators</div>
            <h2>
              Real faces. <em>Your</em> first three seconds.
            </h2>
            <p>
              A cast of {CREATORS.length} AI creators, each with two premade reactions — a gasp, a
              head-shake, a slow approving nod. They open the video, your product takes over, and the
              scroll stops. Hover any of them to watch.
            </p>
          </div>

          <div className="lp-creators">
            {CREATORS.map((c) => (
              <div className="lp-creator" key={c.id}>
                <HookPreview hook={c.hooks[0]} fallbackImg={c.img} alt={`${c.name} — ${c.vibe}`} />
                <div className="lp-creator-body">
                  <b>{c.name}</b>
                  <span>{c.vibe}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Hook videos ── */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-split">
            <div>
              <div className="lp-kicker">Hook videos</div>
              <h2 style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', lineHeight: 1.1 }}>
                Their reaction, then <em>your</em> product.
              </h2>
              <p className="muted" style={{ marginTop: 14, fontSize: 15.5 }}>
                The format that actually converts: three seconds of a real face reacting, cut straight
                into your own footage. Record your screen, film the product on a table — whatever you
                have.
              </p>
              <ul className="lp-bullets">
                <li><span className="tickmark">✓</span><span><b>Pick a creator and a reaction</b> — 20 hooks to choose from, all shot vertical.</span></li>
                <li><span className="tickmark">✓</span><span><b>Drop in your footage</b> and trim it on a timeline against the hook.</span></li>
                <li><span className="tickmark">✓</span><span><b>Captions written for you</b> from your product name, editable on the frame.</span></li>
                <li><span className="tickmark">✓</span><span><b>Music, overlays and export</b> at 1080 × 1920 — ready for Reels, TikTok and Shorts.</span></li>
              </ul>
            </div>
            <div className="lp-wall narrow">
              {CREATORS.slice(0, 3).map((c) => (
                <HookPreview key={c.id} hook={c.hooks[1] || c.hooks[0]} fallbackImg={c.img} alt={c.name} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Carousels ── */}
      <section className="lp-section" id="carousels" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <div className="lp-kicker">Photo carousels</div>
            <h2>
              Pick a look. Pick an angle. Get a <em>whole</em> carousel.
            </h2>
            <p>
              Choose one of our photo sets, choose the angle you want to take, and Blink writes the
              full sequence — hook slide, three body slides, closing CTA — over the photography. Every
              word, every position and every background stays editable.
            </p>
          </div>

          <div className="lp-sets">
            {photoSets.map((s) => (
              <div className="lp-set" key={s.id}>
                <div className="lp-set-strip">
                  {s.images.slice(0, 3).map((src) => (
                    <img key={src} src={thumbOf(src)} alt="" loading="lazy" />
                  ))}
                </div>
                <div className="lp-set-body">
                  <div className="row between">
                    <b style={{ fontSize: 13.5 }}>{s.name}</b>
                    <span className="chip">10 photos</span>
                  </div>
                  <div className="small muted mt-2">{s.desc}</div>
                </div>
              </div>
            ))}

            {gradientSet && (
              <div className="lp-set">
                <div className="lp-swatches">
                  <div style={{ background: 'linear-gradient(20deg, #0f0c29, #302b63 50%, #24243e)' }} />
                  <div style={{ background: 'linear-gradient(45deg, #1f1c2c, #928dab)' }} />
                  <div style={{ background: 'linear-gradient(70deg, #0d1b2a, #1b263b 50%, #415a77)' }} />
                </div>
                <div className="lp-set-body">
                  <div className="row between">
                    <b style={{ fontSize: 13.5 }}>{gradientSet.name}</b>
                    <span className="chip accent">offline</span>
                  </div>
                  <div className="small muted mt-2">{gradientSet.desc}</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6" style={{ marginTop: 42 }}>
            <div className="lp-kicker">Copy angles</div>
            <p className="muted" style={{ marginBottom: 20, maxWidth: '58ch' }}>
              {angles.length} angles, each writing a different carousel. These are the real hooks
              Blink would open with for a skincare brand called <b style={{ color: 'var(--paper)' }}>Aurelia</b> —
              swap in your own product and they rewrite themselves.
            </p>
            <div className="lp-angles">
              {angles.map((a) => (
                <div className="lp-angle" key={a.id}>
                  <q>{a.hook}</q>
                  <span className="chip">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Custom sets ── */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-split flip">
            <div className="lp-sets" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="lp-set">
                <div className="lp-set-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {photoSets[1]?.images.slice(0, 4).map((src) => (
                    <img key={src} src={thumbOf(src)} alt="" loading="lazy" />
                  ))}
                </div>
                <div className="lp-set-body">
                  <div className="row between">
                    <b style={{ fontSize: 13.5 }}>Spring drop</b>
                    <span className="chip brand">yours</span>
                  </div>
                  <div className="small muted mt-2">Your own product photography</div>
                </div>
              </div>
              <div className="lp-set" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 22, textAlign: 'center', borderStyle: 'dashed' }}>
                <div style={{ fontSize: 28, color: 'var(--brand)' }}>＋</div>
                <b style={{ fontSize: 13.5, marginTop: 8 }}>New custom set</b>
                <span className="small muted" style={{ marginTop: 4 }}>Drop in your own images</span>
              </div>
            </div>
            <div>
              <div className="lp-kicker">Custom sets</div>
              <h2 style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', lineHeight: 1.1 }}>
                Or bring <em>your own</em> photos.
              </h2>
              <p className="muted" style={{ marginTop: 14, fontSize: 15.5 }}>
                Product shots, packaging, screenshots, customer photos — upload them into a named set
                and they behave exactly like ours.
              </p>
              <ul className="lp-bullets">
                <li><span className="tickmark">✓</span><span><b>Build as many sets as you like</b>, one per launch, season or campaign.</span></li>
                <li><span className="tickmark">✓</span><span><b>Private storage</b> — your uploads are served over signed URLs, never public.</span></li>
                <li><span className="tickmark">✓</span><span><b>Mix and match per slide</b>: shuffle any background from any set while editing.</span></li>
                <li><span className="tickmark">✓</span><span><b>Start blank</b> and write the copy yourself when you already know the words.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Blink AI ── */}
      <section className="lp-section" id="blink" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="card" style={{ borderColor: 'rgba(168, 120, 255, 0.28)', background: 'linear-gradient(150deg, rgba(160, 90, 240, 0.1), var(--ink-2) 60%)', padding: 'clamp(26px, 4vw, 48px)' }}>
            <div className="lp-split">
              <div>
                <div className="lp-kicker">Blink AI</div>
                <h2 style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', lineHeight: 1.1 }}>
                  Describe the shot. Get the <em>video</em>.
                </h2>
                <p className="muted" style={{ marginTop: 14, fontSize: 15.5 }}>
                  When no premade hook fits, write the scene instead. Add a photo of your product, pick
                  a creator to appear in it, and Blink generates the clip — Google Veo under the hood,
                  metered on your plan.
                </p>
                <ul className="lp-bullets">
                  <li><span className="tickmark">✓</span><span><b>4–8 second clips</b> at 720p or 1080p.</span></li>
                  <li><span className="tickmark">✓</span><span><b>9:16 or 16:9</b> — vertical for Reels, wide for a landing page.</span></li>
                  <li><span className="tickmark">✓</span><span><b>Reference your product photo</b> so the generated scene holds your actual packaging.</span></li>
                  <li><span className="tickmark">✓</span><span><b>Renders in the background</b> — close the tab, it lands in your library.</span></li>
                </ul>
                <div className="row mt-6" style={{ gap: 10 }}>
                  <span className="chip accent">Growth plan</span>
                  <span className="small muted">Included on Growth — not part of the free trial.</span>
                </div>
              </div>
              <div className="lp-wall narrow">
                {CREATORS.slice(6, 9).map((c) => (
                  <HookPreview key={c.id} hook={c.hooks[0]} fallbackImg={c.img} alt={c.name} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

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
                Mint a carousel or a hook video in one click, then make it yours: reshuffle
                backgrounds, drag text, restyle, re-roll the hook, swap the creator.
              </p>
            </div>
            <div className="lp-step">
              <div className="lp-step-n">STEP 03</div>
              <h3>Export and post</h3>
              <p>
                Slides at 1080 × 1350 for Instagram, video at 1080 × 1920 for Reels, TikTok and
                Shorts. Everything you make stays in your library.
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
              Start free. Upgrade when it's <em>working</em>.
            </h2>
            <p>
              Seven days of unlimited carousels and hook videos, no card required. Blink AI needs a
              Growth plan. After that, pick the plan that matches how much you're posting — and
              change or cancel it whenever you like.
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
              {shownPlans.map((plan) => {
                const twin = plans.find((p) => p.tier === plan.tier && p.period === 'monthly')
                const saving =
                  plan.period === 'yearly' && twin
                    ? Math.round((1 - plan.price / (twin.price * 12)) * 100)
                    : 0
                return (
                  <div key={plan.id} className={`card plan ${plan.tier === 'growth' ? 'featured' : ''}`}>
                    {plan.tier === 'growth' && <span className="plan-flag">Includes Blink AI</span>}
                    <h3 style={{ fontSize: 20 }}>{plan.name}</h3>
                    <div className="plan-price">
                      {money(plan.price, plan.currency)}
                      <span className="small muted"> /{plan.period === 'yearly' ? 'year' : 'month'}</span>
                    </div>
                    {plan.period === 'yearly' && twin && (
                      <div className="small muted" style={{ marginTop: -2 }}>
                        {perMonth(plan.price, plan.currency)}/month, billed yearly
                        {saving > 0 && <> — <b style={{ color: 'var(--brand)' }}>save {saving}%</b></>}
                      </div>
                    )}
                    <p className="small muted" style={{ minHeight: 38, marginTop: 8 }}>{plan.blurb}</p>
                    <ul className="plan-features">
                      {(plan.features || []).map((f) => (
                        <li key={f}><span className="tickmark">✓</span>{f}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 18 }}>
                      <SignInButton
                        label="Start 7 days free"
                        className={`btn ${plan.tier === 'growth' ? 'primary' : ''}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Prices are unavailable, not unknown — the trial is the offer either
            // way, so the section still converts.
            <div className="empty" style={{ maxWidth: 560, margin: '0 auto' }}>
              {plansState === 'loading' ? (
                <span className="tick">Loading plans…</span>
              ) : (
                <>
                  <b>Seven days free, no card.</b>
                  <div className="small mt-2">Sign in to see the current plans.</div>
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
              <summary>What happens after the trial?</summary>
              <p>
                Nothing is deleted. Your projects, sets and exports stay exactly where they are — pick
                a plan whenever you're ready and everything comes straight back.
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
            Set up your product in a minute, and have your first carousel and hook video before you
            finish your coffee.
          </p>
          <div className="lp-cta">
            <SignInButton />
            <div className="lp-trust">
              <b>Free for 7 days</b>, no card.
              {cheapest && <> Then from {money(cheapest.price, cheapest.currency)}/month.</>}
            </div>
          </div>
        </div>

        <footer className="lp-footer">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Blink UGC. Made for people who ship.</span>
        </footer>
      </div>
    </div>
  )
}

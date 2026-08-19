import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans } from '../lib/razorpay.js'
import { money, perMonth } from '../lib/money.js'
import { CREATORS, getCreator } from '../lib/creators.js'
import { builtinSets, isGradientRef } from '../lib/library.js'
import { presetOptions } from '../lib/copygen.js'
import { SHOWCASE, ANIMATED_SHOWCASE, heroSlides } from '../lib/showcase.js'
import { CHARACTERS, getCharacter } from '../lib/characters.js'
import { supabase, isLocalSupabase } from '../lib/supabase.js'
import { BLINK_TEMPLATES } from '../lib/blinkTemplates.js'
import Logo from '../components/Logo.jsx'
import HookPreview from '../components/HookPreview.jsx'
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

/*
 * Five of the ten, chosen to look like a roster rather than a type: two men,
 * three women, and an age range. Showing all ten here made the page's first
 * three screens one long parade of the same 9:16 face card.
 */
const ROSTER = ['cr_tech_girl', 'cr_gym_guy', 'cr_older_woman', 'cr_casual_guy', 'cr_business_woman']

// The hero shows both things Blink exports — a hook clip and finished carousel
// slides — rather than five faces, leaving the carousels, which are half the
// product, to be described in prose further down and never actually shown.
const HERO_CLIP = 'cr_gym_guy'

// The creator whose reaction fronts the hook-video breakdown, and the frame
// standing in for the footage cut in behind it. A different face from the
// hero's, so the two are not the same clip twice.
const ANATOMY_CREATOR = 'cr_tech_girl'
const ANATOMY_SHOT = '/sets/thumbs/girl/04.jpg'

/*
 * Five of the ten characters, on the same reasoning as ROSTER above. The first
 * two are the athlete and the robot, who are the ones actually acting in the
 * two animated carousels shown directly above them — the roster and the output
 * should visibly be the same cast. The rest cover the range that matters when
 * someone is deciding whether their own category is served: a person, a trade,
 * and something with no human likeness at all.
 */
const CAST = ['ch_athlete', 'ch_robot', 'ch_everyday_woman', 'ch_chef', 'ch_blob']

// The animated carousel whose opening slide leads the hero. The robot's is the
// one that reads at hero size: a pale backdrop against the page's near-black,
// and a character who survives being shown a third of the width he was drawn at.
const HERO_ANIMATED = 'blink'

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
  // Nine, not ten: three full rows rather than two and an orphan. The prose
  // still names the real total, which is what the product actually ships.
  const angles = presetOptions(DEMO_BRAND).slice(0, 9)
  const angleCount = presetOptions(DEMO_BRAND).length

  const roster = ROSTER.map(getCreator).filter(Boolean)
  const cast = CAST.map(getCharacter).filter(Boolean)
  const heroClip = getCreator(HERO_CLIP)
  const heroCards = heroSlides()
  const heroAnimated = ANIMATED_SHOWCASE.find((c) => c.id === HERO_ANIMATED)
  const anatomyCreator = getCreator(ANATOMY_CREATOR)

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Logo size={25} />
          <div className="lp-nav-links">
            <SectionLink to="creators">AI creators</SectionLink>
            <SectionLink to="carousels">Carousels</SectionLink>
            <SectionLink to="animated">Animated</SectionLink>
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
              Animated ones where a 3D character acts the whole thing out. Prompt-to-video when you
              need something that doesn't exist yet. Everything designed, written and exported in
              minutes — no shoot, no agency, no editor.
            </p>
            <div className="lp-cta">
              <SignInButton />
              <div className="lp-trust">
                <b>Photo carousels are free</b>, forever, no card.
                {cheapest && <> The rest from {money(cheapest.price, cheapest.currency)}/month. Cancel anytime.</>}
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

          {/* A carousel either side of a hook clip. The clip sits in the middle
              because it is the one that moves, and the two slides are the half
              of the product the page never used to show at all.

              The two are deliberately not the same kind of carousel: an
              animated slide on the left, a photo one on the right. All three
              things Blink exports, in the order the page then explains them. */}
          <div className="lp-mixwall" aria-label="Carousel slides and a hook video made with Blink">
            <SlidePreview
              slide={heroAnimated?.slides[0]}
              alt={`An animated carousel slide for ${heroAnimated?.name}`}
            />
            <HookPreview
              hook={heroClip?.hooks[0]}
              fallbackImg={heroClip?.img}
              alt={`${heroClip?.name} — ${heroClip?.vibe}`}
              eager
            />
            <SlidePreview
              slide={heroCards[1]}
              style={{ '--pill-accent': heroCards[1]?.accent }}
              alt={`A carousel slide for ${heroCards[1]?.name}`}
            />
          </div>
        </header>
      </div>

      <div className="lp-wrap">
        <div className="lp-strip">
          <span><b>{CREATORS.length}</b> AI creators</span>
          <span><b>{CREATORS.reduce((n, c) => n + c.hooks.length, 0)}</b> hook reactions</span>
          <span><b>{photoSets.length * 10}</b> photo backgrounds</span>
          <span><b>{CHARACTERS.length}</b> 3D characters</span>
          <span><b>{angleCount}</b> copy angles</span>
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
              A cast of {CREATORS.length}, each with two premade reactions — a gasp, a head-shake, a
              slow approving nod. They open the video, your product takes over, and the scroll stops.
              Here are five of them; hover any one to watch.
            </p>
          </div>

          <div className="lp-creators">
            {roster.map((c) => (
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
            {/* The cut itself, rather than three more faces: this section is
                about the shape of the format, and the shape is the thing the
                copy beside it is describing. */}
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
                    aria-label="Your own product footage"
                  />
                  <figcaption><b>0:03</b> your product</figcaption>
                </figure>
              </div>

              <div className="lp-track" aria-hidden="true">
                <div className="lp-track-row">
                  <span className="lp-seg hook">hook · 3s</span>
                  <span className="lp-seg yours">your footage</span>
                </div>
                <div className="lp-track-row">
                  <span className="lp-seg text">captions</span>
                </div>
                <div className="lp-track-row">
                  <span className="lp-seg music">♪ music</span>
                </div>
              </div>
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
              Choose one of {photoSets.length} photo sets, choose the angle you want to take, and Blink
              writes the full sequence — hook slide, three body slides, closing CTA — over the
              photography. Every word, every position and every background stays editable. Two made
              earlier, for two very different products:
            </p>
          </div>

          <div className="lp-showcase">
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
                <figcaption className="lp-show-body">
                  <div className="row between">
                    <b style={{ fontSize: 13.5 }}>{c.name}</b>
                    <span className="chip">{c.category}</span>
                  </div>
                  <div className="small muted mt-2">
                    “{c.angle}” angle · {c.slideCount} slides · 1080 × 1350
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-6" style={{ marginTop: 42 }}>
            <div className="lp-kicker">Copy angles</div>
            <p className="muted" style={{ marginBottom: 20, maxWidth: '58ch' }}>
              {angleCount} angles, each writing a different carousel. These are the real hooks
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

      {/* ── Animated carousels ── */}
      {/* Directly after the photo ones, because the two are a pair: same
          editor, same export, and the only real question a visitor has is
          which of the two they want. */}
      <section className="lp-section" id="animated" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <div className="lp-kicker">Animated carousels</div>
            <h2>
              One character. Every slide. <em>Acting out</em> your words.
            </h2>
            <p>
              The other kind of carousel, with nothing photographed at all. Pick one of{' '}
              {CHARACTERS.length} 3D characters, say what the carousel should be about, and Blink
              writes the copy and draws every slide around it — the same character throughout, doing
              something different on each one, matched to the sentence it sits under. Three to eight
              slides. Two made earlier:
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
                    <span className="chip">{c.category}</span>
                  </div>
                  <div className="small muted mt-2">
                    {c.character} · {c.slideCount} slides · 1080 × 1350
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          <div style={{ marginTop: 42 }}>
            <div className="lp-kicker">The cast</div>
            <p className="muted" style={{ marginBottom: 20, maxWidth: '58ch' }}>
              {CHARACTERS.length} characters in one house style — a cartoon kid, a mascot bird, a
              chef, a robot, a friendly creature with no human likeness at all. Whoever you pick
              holds the same face, hair and clothes across every slide in the set.
            </p>
            <div className="lp-cast">
              {cast.map((c) => (
                <div className="lp-creator" key={c.id}>
                  <img className="lp-cast-img" src={c.img} alt={c.name} loading="lazy" />
                  <div className="lp-creator-body">
                    <b>{c.name}</b>
                    <span>{c.blurb}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ gap: 10, marginTop: 24 }}>
              <span className="chip accent">Starter plan</span>
              <span className="small muted">
                Every slide is drawn to order, so this one is on Starter rather than free.
              </span>
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
                  a creator to appear in it, and Blink generates the clip.
                </p>
                <ul className="lp-bullets">
                  <li><span className="tickmark">✓</span><span><b>4–8 second clips</b> at 720p or 1080p, <b>with generated audio</b>.</span></li>
                  <li><span className="tickmark">✓</span><span><b>9:16 or 16:9</b> — vertical for Reels, wide for a landing page.</span></li>
                  <li><span className="tickmark">✓</span><span><b>Reference your product photo</b> so the generated scene holds your actual packaging.</span></li>
                  <li><span className="tickmark">✓</span><span><b>Renders in the background</b> — close the tab, it lands in your library.</span></li>
                </ul>
                <div className="row mt-6" style={{ gap: 10 }}>
                  <span className="chip accent">Growth plan</span>
                  <span className="small muted">25 videos a month on Growth — the one thing that isn't on Starter.</span>
                </div>
              </div>
              {/* Actual Veo generations, not creator hooks — this section is
                  the only one selling something the premade clips cannot show. */}
              <div className="lp-wall narrow">
                {BLINK_TEMPLATES.map((t) => (
                  <HookPreview key={t.id} hook={t} alt={`Blink AI — ${t.name}`} />
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
              Free where it's free. Paid where it <em>renders</em>.
            </h2>
            <p>
              Photo carousels cost nothing and always will — no card, no countdown, no day eight where
              it stops working. Starter adds hook videos, animated carousels and your own image sets;
              Growth adds Blink AI, 25 videos a month. Change or cancel whenever you like.
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
                const saving =
                  plan.period === 'yearly' && twin
                    ? Math.round((1 - plan.price / (twin.price * 12)) * 100)
                    : 0
                return (
                  <div key={plan.id} className={`card plan ${plan.tier === 'growth' ? 'featured' : ''}`}>
                    {plan.tier === 'growth' && <span className="plan-flag">25 Blink AI videos/mo</span>}
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
                        label={`Get ${plan.name}`}
                        className={`btn ${plan.tier === 'growth' ? 'primary' : ''}`}
                      />
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
                same editor and export the same way. Animated carousels are on Starter, because
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
                sets are on Starter; Blink AI is on Growth and capped at 25 videos a month, because
                those render on hardware somebody bills us for. If you cancel later you drop back to
                free and keep everything you made.
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
        </footer>
      </div>
    </div>
  )
}

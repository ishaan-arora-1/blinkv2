import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans } from '../lib/razorpay.js'
import { money } from '../lib/money.js'
import { track } from '../lib/analytics.js'
import { markAdEntry } from '../lib/entry.js'
import { enquiryHref, CONTACT_EMAIL } from '../lib/contact.js'
import { BRAND } from '../lib/reelStory.js'
import Logo from '../components/Logo.jsx'
import SignInButton from '../components/SignInButton.jsx'
import ReelGraph from '../components/ReelGraph.jsx'

/**
 * The landing page for paid traffic. One product, one price, one door.
 *
 * The main page cannot do this job. Its most prominent line is that photo
 * carousels are free forever, which is the right thing to say to someone who
 * arrived from a search and the wrong thing to say to someone who just watched
 * an ad about AI video and cost money to get here — they take the free thing,
 * leave, and the spend teaches you only that free things are popular.
 *
 * So: no free-forever promise, no tour of the other two features, no nav to
 * wander off into. Blink AI, the price of the plan that unlocks it, and the
 * graph as the evidence. The free tier appears once, at the bottom, as the
 * answer to "what if I'm not ready" rather than as the headline offer.
 *
 * The price is read from the same table that bills people, so this page cannot
 * advertise an amount checkout would not charge.
 */
export default function AdLanding() {
  const { authStatus } = useAuth()
  const [studio, setStudio] = useState(null)

  // The note the post-signup redirect reads. Left on arrival rather than on the
  // click, because OAuth reloads the document and anything held in memory at
  // click time is gone by the time it would be needed.
  useEffect(() => {
    markAdEntry()
    track('ad_landing_viewed', { page: 'go' }, { meta: 'ViewContent' })
  }, [])

  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((r) => {
        if (!alive) return
        const plans = r.plans || []
        setStudio(plans.find((p) => p.tier === 'studio' && p.period === 'monthly') || null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const signedIn = authStatus === 'authenticated'
  const price = studio ? `${money(studio.price, studio.currency)}/month` : '$49/month'

  // Someone already signed in has no use for a sign-up button. Sending them to
  // the feature the ad was about is the only sensible thing this page can do
  // for them.
  const cta = signedIn ? (
    <a className="btn primary" href="#/blink">
      ✦ Open Blink AI
    </a>
  ) : (
    <SignInButton label="Make your first ad" className="btn primary" />
  )

  return (
    <div className="lp go">
      <nav className="go-nav">
        <Logo size={25} />
        <span className="chip brand">Blink AI</span>
      </nav>

      <div className="lp-wrap">
        <header className="go-hero">
          <h1>
            One prompt. <em>A&nbsp;whole&nbsp;ad.</em>
          </h1>
          <p>
            Upload a photo of your product and write one line. Blink AI plans the scenes, draws
            every frame, films each one, writes the script, reads it aloud and burns in the
            subtitles — up to 48 seconds of finished ad. No storyboard, no shoot, no edit.
          </p>

          <div className="go-cta">
            {cta}
            <span className="go-price">
              <b>{price}</b> on Studio · cancel anytime
            </span>
          </div>
        </header>

        {/* The deal, before the graph that proves it. */}
        <div className="lp-deal go-deal">
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
      </div>

      <section className="lp-section" style={{ paddingTop: 'clamp(40px, 6vw, 72px)' }}>
        <div className="lp-wrap">
          <div className="lp-sec-head center">
            <div className="lp-kicker">A real generation, start to finish</div>
            <h2>
              This is one run, <em>every step of it</em>.
            </h2>
            <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              The brief that was typed for a supplement brand, the frames it drew, the clips it
              filmed, the script, the voice, and the 29-second ad that came out. Nothing here is
              a mock-up.
            </p>
          </div>

          <ReelGraph />
        </div>
      </section>

      {/* One price, stated plainly. The comparison table lives on the main
          site; someone who came from an ad needs to know one number. */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="go-plan">
            <div>
              <div className="lp-kicker">Studio</div>
              <div className="go-plan-price">
                {studio ? money(studio.price, studio.currency) : '$49'}
                <span>/month</span>
              </div>
              <p>Everything you just watched, two minutes of finished video a month.</p>
              {cta}
              <span className="small muted" style={{ display: 'block', marginTop: 12 }}>
                Cancel anytime. Payments handled by Razorpay — we never see your card.
              </span>
            </div>

            <ul className="go-plan-list">
              <li><span className="tickmark">✓</span>Up to 6 scenes, up to 48 seconds per ad</li>
              <li><span className="tickmark">✓</span>Your product held identical in every frame</li>
              <li><span className="tickmark">✓</span>Redraw any frame before you pay to film it</li>
              <li><span className="tickmark">✓</span>8 narrator voices, script written for you</li>
              <li><span className="tickmark">✓</span>Subtitles timed to the words actually spoken</li>
              <li><span className="tickmark">✓</span>1080 × 1920 and 16:9 exports</li>
              <li><span className="tickmark">✓</span>Hook videos and carousels included</li>
            </ul>
          </div>

          <div className="go-faq">
            <details>
              <summary>What do I need to give it?</summary>
              <p>
                One photo of your product and one sentence. Everything else — the scenes, the
                frames, the clips, the script, the voice, the subtitles — is made for you. Upload
                a better photo and the product is reproduced more exactly; that is the only lever
                that really matters.
              </p>
            </details>
            <details>
              <summary>Does it look AI-generated?</summary>
              <p>
                Judge the ad above rather than take our word for it. The frames are prompted
                against the specific things that give generated footage away — blurred
                backgrounds, studio lighting, flawless skin, colour grading — and every scene is
                drawn from the first one, so the same person stays in the same room throughout.
              </p>
            </details>
            <details>
              <summary>What if it gets a scene wrong?</summary>
              <p>
                You see every frame before a second of video is paid for, and you can redraw any
                of them by typing what to change. The wardrobe changes in the graph above are
                real redraws from real instructions.
              </p>
            </details>
            <details>
              <summary>I'm not ready to pay.</summary>
              <p>
                Then start on the free tier — photo carousels, unlimited, no card — and move up
                when you want video. {' '}
                <a href="#/" style={{ color: 'var(--brand)' }}>See everything Blink UGC does.</a>
              </p>
            </details>
          </div>

          <div className="lp-final" style={{ marginTop: 'clamp(34px, 5vw, 56px)' }}>
            <h2>
              Your product, in an ad, <em>tonight</em>.
            </h2>
            <div className="go-cta" style={{ justifyContent: 'center', marginTop: 22 }}>
              {cta}
              <span className="go-price">
                <b>{price}</b> on Studio · cancel anytime
              </span>
            </div>
          </div>

          <footer className="lp-footer">
            <Logo size={22} />
            <span>© {new Date().getFullYear()} Blink UGC · {BRAND.name} ad made with Blink AI</span>
            <a href={enquiryHref('Blink AI')} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>
          </footer>
        </div>
      </section>
    </div>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import { DEMO } from '../lib/demoIdeas.js'
import { FEATURED } from '../lib/outputs.js'
import SignInButton from './SignInButton.jsx'

/**
 * The three landing sections that sell what Blink became on top of the reel
 * maker: the strategist (Ad Ideas), the cast (AI Actors), and what the two
 * replace. Each shows real output — the Ad Ideas panel is unedited engine
 * output (see demoIdeas.js) and the actor clip is a real take.
 */

const FACES = [
  ['casual-girl', 'Chloe'], ['tech-guy', 'Ethan'], ['older-woman', 'Susan'], ['gym-guy', 'Jake'], ['business-woman', 'Diana'],
  ['casual-guy', 'Sam'], ['tech-girl', 'Nina'], ['dad-guy', 'Mike'], ['gym-girl', 'Lena'], ['older-man', 'Frank'],
]

export function IdeasShowcase() {
  return (
    <section className="v3-section" id="ideas">
      <div className="v2-head center">
        <div className="v2-kicker">Ad Ideas · free on every account</div>
        <h2>Paste a link. Get the <em>strategy</em>.</h2>
        <p>
          Blink reads your product page like a creative strategist would — who buys it, what's frustrating them, six
          angles to sell it on — then writes the ads. Hook, script, caption, shot list and CTA, scored for how hard
          they stop the scroll.
        </p>
      </div>

      <div className="lf-ideas">
        <div className="lf-ideas-in">
          <div className="lf-label">What we gave it</div>
          <div className="lf-quote">{DEMO.input}</div>
          <div className="lf-label mt-6">Who buys it</div>
          <p className="lf-p">{DEMO.audience}</p>
          <div className="lf-label mt-4">What hurts</div>
          <ul className="lf-list">{DEMO.painPoints.map((p) => <li key={p}><span>✕</span>{p}</li>)}</ul>
          <div className="lf-label mt-4">Six angles</div>
          <div className="lf-chips">{DEMO.angles.map((a) => <span key={a}>{a}</span>)}</div>
        </div>

        <div className="lf-ideas-out" id="ideas-ads">
          {DEMO.ads.map((ad) => (
            <div key={ad.hook} className="lf-ad">
              <div className="lf-ad-top">
                <span className="lf-tag">{ad.framework}</span>
                <span className="lf-tag">{ad.seconds}s</span>
                <span className={`lf-score ${ad.score >= 75 ? 'hi' : 'mid'}`}>{ad.score}</span>
              </div>
              <div className="lf-hook">“{ad.hook}”</div>
              <div className="lf-script">{ad.script}</div>
              <div className="lf-ad-actions">
                <span>◉ Film with AI actor</span>
                <span>✦ Blink AI reel</span>
              </div>
            </div>
          ))}
          <div className="lf-note">Real output for the description on the left, unedited. Yours takes about thirty seconds.</div>
        </div>
      </div>
    </section>
  )
}

function DemoClip({ src, poster, tag }) {
  const ref = useRef(null)
  const [muted, setMuted] = useState(true)
  useEffect(() => {
    const v = ref.current
    if (!v) return undefined
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.3 })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  return (
    <div className="lf-clip">
      <video ref={ref} src={src} poster={poster} muted={muted} loop playsInline preload="metadata" />
      <button className="lf-sound" onClick={() => setMuted((m) => !m)}>{muted ? '🔈 Tap for sound' : '🔊 Sound on'}</button>
      <span className="lf-clip-tag">{tag}</span>
    </div>
  )
}

export function ActorsShowcase() {
  return (
    <section className="v3-section" id="actors">
      <div className="lf-actors">
        <div className="lf-actors-copy">
          <div className="v2-kicker">AI Actors · Studio</div>
          <h2 className="lf-h2">A creator reads your script. <em>Holding your product.</em></h2>
          <p className="lf-p">
            Pick one of ten creators, paste a script — or send one over from Ad Ideas — and get a lip-synced,
            selfie-style video of them talking about your product, with your real product photo in their hand. Or
            upload one selfie and clone yourself.
          </p>
          <ul className="lf-ticks">
            <li>Lip-synced to every word, with natural head and hand movement</li>
            <li>Your actual product in their hand — not a lookalike</li>
            <li>8 voices, takes up to 60 seconds, vertical 9:16</li>
            <li>Clone yourself from a single photo</li>
          </ul>
          <SignInButton label="Cast your first actor" className="btn primary" intent="studio" />
        </div>
        {/* The centre clip of the hero, with its sound: a creator holding the
            product and talking to camera, which is the format this section
            sells. It is client work rather than an AI Actors take, so the tag
            says made with Blink and does not claim more than that. */}
        <DemoClip src={FEATURED[1].hd || FEATURED[1].src} poster={FEATURED[1].poster} tag="Made with Blink" />
      </div>
      <div className="lf-faces" id="actors-faces">
        {FACES.map(([f, name]) => (
          <div key={f} className="lf-face">
            <img src={`/creators/${f}.jpg`} alt={name} loading="lazy" />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * What a month of Blink replaces, at the going rate for each job.
 *
 * Ranges rather than single numbers, and labelled as typical freelance rates:
 * they vary by market and nobody should read them as a quote. The point is the
 * order of magnitude, which is not in dispute.
 */
const REPLACES = [
  ['A creative strategist to work out your angles', '$500+ per brief'],
  ['A copywriter for 30 scroll-stopping scripts', '$300–$900'],
  ['UGC creators to film them', '$150–$300 per video'],
  ['A product shoot for statics and posts', '$500+ per day'],
  ['An editor for captions, cuts and voiceover', '$50–$150 per video'],
]

export function ValueStack({ price }) {
  return (
    <section className="v3-section" id="value">
      <div className="v2-head center">
        <h2>A whole creative team, <em>in one tab</em>.</h2>
        <p>What it costs to get the same work done the usual way, at typical freelance rates.</p>
      </div>
      <div className="lf-value">
        {REPLACES.map(([job, cost]) => (
          <div key={job} className="lf-value-row">
            <span>{job}</span>
            <s>{cost}</s>
          </div>
        ))}
        <div className="lf-value-row total">
          <span>Blink Studio — all of it, every month</span>
          <b>{price || '$49'}/mo</b>
        </div>
      </div>
    </section>
  )
}

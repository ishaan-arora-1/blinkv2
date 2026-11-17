import React, { useEffect } from 'react'
import { money } from '../lib/money.js'
import SignInButton from './SignInButton.jsx'

/**
 * What the Generate button opens.
 *
 * It answers the only two questions somebody has at that moment — why can't I
 * press it, and what does it cost — and then gets out of the way. No countdown,
 * no "limited spots", no fake queue. They typed an idea thirty seconds ago;
 * what they need is a price and a button, not a performance.
 *
 * Their idea is shown back to them so it is visibly not lost. It is already in
 * localStorage by the time this renders, and the Blink AI composer reads it
 * after sign-in, so the line is a true statement rather than a reassurance.
 *
 * Only Studio and Agency appear: Blink AI is gated at the studio tier on the
 * server, so offering Creator here would sell somebody a plan that cannot do
 * the thing they just asked for.
 */
const BLINK_TIERS = ['studio', 'agency']

export default function Paywall({ idea, plans, onClose, onSeeAll }) {
  // Escape closes it. A modal with one exit, and that exit a small ✕ in a
  // corner, is a modal people close by leaving the site.
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const offer = plans.filter((p) => BLINK_TIERS.includes(p.tier))

  return (
    <div className="pw" role="dialog" aria-modal="true" aria-label="Subscribe to generate" onClick={onClose}>
      <div className="pw-card" onClick={(e) => e.stopPropagation()}>
        <button className="pw-x" onClick={onClose} aria-label="Close">✕</button>

        <div className="v2-kicker">Blink AI</div>
        <h3>Generating is on a plan.</h3>
        <p className="pw-sub">
          Every second of video is drawn, filmed and narrated by models we pay for, so there is no
          free run to hand out. Pick a plan and your idea is waiting in the composer.
        </p>

        {idea && (
          <div className="pw-idea">
            <span>Your idea, saved</span>
            <q>{idea}</q>
          </div>
        )}

        {offer.length > 0 ? (
          <div className="pw-plans">
            {offer.map((p) => (
              <div className={`pw-plan${p.tier === 'studio' ? ' pick' : ''}`} key={p.id}>
                <div className="pw-plan-top">
                  <b>{p.name}</b>
                  <span>{money(p.price, p.currency)}<small> /mo</small></span>
                </div>
                <SignInButton
                  label={`Get ${p.name}`}
                  className={`btn ${p.tier === 'studio' ? 'primary' : ''} sm`}
                  intent={p.tier}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Plans not loaded — the API is down or still answering. Sending them
             to the pricing section is better than a dead modal. */
          <div className="pw-plans">
            <SignInButton label="Sign up to see the plans" className="btn primary" />
          </div>
        )}

        <button className="pw-all" type="button" onClick={onSeeAll}>
          Compare all three plans →
        </button>
      </div>
    </div>
  )
}

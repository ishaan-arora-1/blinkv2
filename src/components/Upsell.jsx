import React from 'react'
import { useAuth } from '../lib/auth.jsx'
import { planFor, isPaying } from '../lib/tiers.js'
import { go } from '../lib/router.js'

/**
 * The card a locked feature shows instead of itself.
 *
 * Three pages needed the same thing the moment the free tier arrived — Videos,
 * Blink AI and Image Sets — and the part that is easy to get subtly wrong in
 * three places is the verb. Someone on the free tier is being asked to
 * subscribe; someone already paying for Creator and looking at Blink AI is
 * being asked to upgrade. "Upgrade to Studio" shown to a free account promises
 * a thing they do not have, and "See plans" shown to a customer sends them to a
 * page to work out for themselves what they are missing.
 *
 * `pitch` is the one line each feature has to write for itself: what the plan
 * actually gets you, in the words of that feature.
 */
export default function Upsell({ feature, pitch, children }) {
  const { entitlement } = useAuth()
  const plan = planFor(feature)
  const upgrading = isPaying(entitlement)

  return (
    <div className="card upsell" style={{ maxWidth: 620 }}>
      <div className="row"><span className="chip accent">{plan} plan</span></div>
      <h3 style={{ margin: '12px 0 8px' }}>
        {upgrading ? `${plan} unlocks this` : `This one is on ${plan}`}
      </h3>
      <p className="small muted">{pitch}</p>
      {children}
      <div className="row mt-4">
        <button className="btn primary" onClick={() => go('/pricing')}>
          {upgrading ? `Upgrade to ${plan} →` : `See ${plan} →`}
        </button>
      </div>
      {!upgrading && (
        <div className="small muted mt-4">
          Photo carousels stay free on your account either way — nothing you've made goes anywhere.
        </div>
      )}
    </div>
  )
}

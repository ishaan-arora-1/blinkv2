import React from 'react'
import { useAuth } from '../lib/auth.jsx'
import { planFor, isPaying, FEATURE_TIER } from '../lib/tiers.js'
import { go } from '../lib/router.js'
import PlanCard from './PlanCard.jsx'

/**
 * What a locked feature shows instead of itself: why it is locked, and the plan
 * that unlocks it, buyable on the spot.
 *
 * Three pages needed the same thing the moment the free tier arrived — Videos,
 * Blink AI and Image Sets — and the part that is easy to get subtly wrong in
 * three places is the verb. Someone on the free tier is being asked to
 * subscribe; someone already paying for Creator and looking at Blink AI is
 * being asked to upgrade. "Upgrade to Studio" shown to a free account promises
 * a thing they do not have, and "See plans" shown to a customer sends them to a
 * page to work out for themselves what they are missing.
 *
 * The card beside the pitch is the change that matters for anyone arriving from
 * an ad. They clicked something that named one price, signed up, and used to
 * land here on a button that sent them to a page of four plans — a comparison
 * screen, at the moment of highest intent, offering a cheaper tier that does
 * not include what they came for. Now the plan is here, and buying it opens the
 * feature on this page without going anywhere.
 *
 * `pitch` is the one line each feature has to write for itself: what the plan
 * actually gets you, in the words of that feature.
 */
export default function Upsell({ feature, pitch, children }) {
  const { entitlement } = useAuth()
  const plan = planFor(feature)
  const tier = FEATURE_TIER[feature]
  const upgrading = isPaying(entitlement)

  return (
    <div className="upsell-split">
      <div className="card upsell">
        <div className="row"><span className="chip accent">{plan} plan</span></div>
        <h3 style={{ margin: '12px 0 8px' }}>
          {upgrading ? `${plan} unlocks this` : `This one is on ${plan}`}
        </h3>
        <p className="small muted">{pitch}</p>
        {children}

        {!upgrading && (
          <div className="small muted mt-4">
            Photo carousels stay free on your account either way — nothing you've made goes
            anywhere.
          </div>
        )}

        {/* Secondary, and the fallback if the card beside this cannot load its
            plan: someone who wants to compare tiers can still go and do it. */}
        <button className="btn ghost sm mt-4" onClick={() => go('/pricing')}>
          Compare all plans →
        </button>
      </div>

      <PlanCard tier={tier} />
    </div>
  )
}

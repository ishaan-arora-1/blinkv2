import { userFromToken } from '../supabase.js'
import {
  resolveEntitlement,
  allows,
  METERED,
  FEATURE_TIER,
  FEATURE_LABEL,
  PLAN_NAME,
} from '../entitlements.js'
import { unauthorized, forbidden, wrap } from './errors.js'

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

/** Rejects anything without a valid Supabase session. */
export const requireAuth = wrap(async (req, _res, next) => {
  const token = bearer(req)
  if (!token) throw unauthorized()

  const user = await userFromToken(token)
  if (!user) throw unauthorized('Your session has expired. Sign in again.')

  req.user = user
  req.accessToken = token
  next()
})

/**
 * Gate a route on a feature. This is the enforcement point — the client hides
 * what you cannot use, but this is what actually says no.
 */
export const requireFeature = (feature) =>
  wrap(async (req, _res, next) => {
    const ent = await resolveEntitlement(req.user.id)
    req.entitlement = ent

    if (!allows(ent, feature)) {
      const needs = FEATURE_TIER[feature]
      const label = FEATURE_LABEL[feature] || 'That feature'

      // Three different noes, and telling them apart matters. A trial user
      // blocked from a metered feature is not on the wrong plan and has nothing
      // to upgrade — they are on the right tier already and simply have not
      // subscribed. "Upgrade to Starter" to someone already on Starter reads as
      // a bug in the product.
      const message =
        ent.tier === 'none'
          ? 'Your plan has ended. Pick a plan to keep creating.'
          : METERED.has(feature) && ent.onTrial
            ? `${label} needs a paid plan — it is not part of the free trial. Subscribe to unlock it.`
            : `${label} ${label.endsWith('s') ? 'are' : 'is'} part of the ${PLAN_NAME[needs]} plan.`

      throw forbidden(message, {
        feature,
        tier: ent.tier,
        upgradeTo: needs,
        // Lets the client tell "subscribe" apart from "upgrade" without
        // re-deriving the rule it does not own.
        needsPaidPlan: METERED.has(feature) && ent.onTrial,
      })
    }
    next()
  })

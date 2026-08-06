import { userFromToken } from '../supabase.js'
import {
  resolveEntitlement,
  allows,
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

      // Two different noes, and telling them apart is the difference between a
      // useful button and a confusing one. Someone on the free tier is being
      // asked to buy; someone already paying for Starter is being asked to move
      // up. "Upgrade" to a customer with nothing to upgrade from reads as a bug.
      const onPaidPlan = Boolean(PLAN_NAME[ent.tier])
      const message = onPaidPlan
        ? `${label} ${label.endsWith('s') ? 'are' : 'is'} part of the ${PLAN_NAME[needs]} plan — upgrade to unlock ${label.endsWith('s') ? 'them' : 'it'}.`
        : `${label} ${label.endsWith('s') ? 'are' : 'is'} part of the ${PLAN_NAME[needs]} plan.`

      throw forbidden(message, {
        feature,
        tier: ent.tier,
        upgradeTo: needs,
        // Lets the client tell "subscribe" apart from "upgrade" without
        // re-deriving the rule it does not own.
        isUpgrade: onPaidPlan,
      })
    }
    next()
  })

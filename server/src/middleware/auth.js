import { userFromToken } from '../supabase.js'
import { resolveEntitlement, tierAllows, FEATURE_TIER, PLAN_NAME } from '../entitlements.js'
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

    if (!tierAllows(ent.tier, feature)) {
      const needs = FEATURE_TIER[feature]
      throw forbidden(
        ent.tier === 'none'
          ? 'Your plan has ended. Pick a plan to keep creating.'
          : `Blink AI is part of the ${PLAN_NAME[needs]} plan. Upgrade to generate videos.`,
        { feature, tier: ent.tier, upgradeTo: needs }
      )
    }
    next()
  })

/**
 * Client-side labels for the plan tiers.
 *
 * Mirrors FEATURE_TIER and PLAN_NAME in server/src/entitlements.js. The server
 * is the authority — it decides what is actually allowed, and every gated route
 * re-checks. This exists only so the UI can label a lock before it has been
 * told no, which it needs to do before any request is made.
 */

export const PLAN_NAME = { starter: 'Starter', growth: 'Growth' }

export const FEATURE_TIER = {
  carousels: 'free',
  videos: 'starter',
  animated: 'starter',
  sets: 'starter',
  blink: 'growth',
}

/** The plan name that unlocks a feature — 'Growth' for Blink AI. */
export function planFor(feature) {
  return PLAN_NAME[FEATURE_TIER[feature]] ?? 'a paid'
}

/**
 * Why a feature is locked, in the words the user needs.
 *
 * Two states, because they call for different buttons: a free account is being
 * asked to subscribe, a Starter customer looking at Blink AI is being asked to
 * move up. Naming the plan works for both, so the label is the same shape and
 * only the verb around it changes at the call site.
 */
export function lockReason(feature) {
  return `On the ${planFor(feature)} plan`
}

/** Is this someone with a plan already, or someone with none? */
export function isPaying(entitlement) {
  return Boolean(PLAN_NAME[entitlement?.tier])
}

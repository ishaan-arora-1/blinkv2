/**
 * Client-side labels for the plan tiers.
 *
 * Mirrors FEATURE_TIER and PLAN_NAME in server/src/entitlements.js. The server
 * is the authority — it decides what is actually allowed, and every gated route
 * re-checks. This exists only so the UI can label a lock before it has been
 * told no, which it needs to do before any request is made.
 */

export const PLAN_NAME = { creator: 'Creator', studio: 'Studio', agency: 'Agency' }

export const FEATURE_TIER = {
  carousels: 'free',
  videos: 'creator',
  animated: 'creator',
  sets: 'creator',
  blink: 'studio',
  multiframe: 'studio',
}

/** The plan name that unlocks a feature — 'Studio' for Blink AI. */
export function planFor(feature) {
  return PLAN_NAME[FEATURE_TIER[feature]] ?? 'a paid'
}

/**
 * Why a feature is locked, in the words the user needs.
 *
 * Two states, because they call for different buttons: a free account is being
 * asked to subscribe, a Creator customer looking at Blink AI is being asked to
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

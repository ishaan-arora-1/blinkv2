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
  carousels: 'starter',
  videos: 'starter',
  animated: 'starter',
  blink: 'growth',
}

/**
 * Features that spend money per use. Mirrors METERED in the server's
 * entitlements.js.
 *
 * These need a real subscription, not just a tier — the trial grants Starter,
 * so an animated carousel is the one Starter-tier thing a trial cannot do. The
 * server enforces it; this is here so the UI can say "subscribe" rather than
 * the nonsensical "upgrade to Starter" to someone whose tier is already Starter.
 */
export const METERED = new Set(['animated', 'blink'])

/** The plan name that unlocks a feature — 'Growth' for Blink AI. */
export function planFor(feature) {
  return PLAN_NAME[FEATURE_TIER[feature]] ?? 'a paid'
}

/** Why a feature is locked, in the words the user needs. */
export function lockReason(feature, entitlement) {
  if (entitlement?.tier === 'none') return 'Your plan has ended'
  if (METERED.has(feature) && entitlement?.onTrial) return 'Needs a paid plan'
  return `On the ${planFor(feature)} plan`
}

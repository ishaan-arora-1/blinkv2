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
  blink: 'growth',
}

/** The plan name that unlocks a feature — 'Growth' for Blink AI. */
export function planFor(feature) {
  return PLAN_NAME[FEATURE_TIER[feature]] ?? 'a paid'
}

import { admin } from './supabase.js'

// Mirrors public.entitled_tier(), last redefined in 0012_free_tier_no_trial.sql.
// The SQL function is the canonical definition; this reads through it rather than
// reimplementing the rules, so the two cannot drift.

// Tier names match the customer-facing plan names on purpose, so a support
// question about "Growth" does not need translating to read the database.
//
// 'free' is a real tier, not the absence of one. Every signed-in account has at
// least this, permanently — there is no lapsed state below it to fall into.
export const TIER_RANK = { free: 0, starter: 1, growth: 2 }

/**
 * What each feature costs you in tier.
 *
 * The line between free and paid is what a use of the feature costs us. Photo
 * carousels are composed in the browser from our own stock photography and our
 * own copy templates: no vendor is billed, no render runs on our side, so there
 * is nothing for a plan to meter and no reason to make anyone buy one. Every
 * other feature either bills a vendor per use or holds storage we pay for.
 */
export const FEATURE_TIER = {
  carousels: 'free',
  videos: 'starter',
  animated: 'starter',
  sets: 'starter',
  blink: 'growth',
  // Multiframe renders the same Veo clips Blink AI does, several at a time, and
  // spends the same monthly allowance. Anything cheaper than Growth would be
  // selling a discount on the most expensive thing the product does.
  multiframe: 'growth',
}

/**
 * Features that spend money at a vendor on every single use.
 *
 * These are checked against paid_tier() rather than entitled_tier(), which is
 * the difference between "may see it" and "has bought it". Those two answers
 * are identical for every account today — the trial that used to separate them
 * is gone as of 0012, and nothing else grants a tier without a payment.
 *
 * The distinction is kept anyway, for the same reason the SQL function is: it
 * costs one property on an object, and it is the difference between a future
 * comp'd or promotional tier being a pricing decision and it being an
 * unmetered vendor bill nobody notices until it arrives.
 */
export const METERED = new Set(['animated', 'blink', 'multiframe'])

/** The plan name a user must be on to unlock a feature, for error copy. */
export const PLAN_NAME = { starter: 'Starter', growth: 'Growth' }

/** What to call a feature when telling someone they cannot use it. */
export const FEATURE_LABEL = {
  carousels: 'Photo carousels',
  videos: 'Hook videos',
  animated: 'Animated carousels',
  sets: 'Custom image sets',
  blink: 'Blink AI',
  multiframe: 'Multiframe',
}

export function tierAllows(tier, feature) {
  const need = FEATURE_TIER[feature]
  if (!need) return false
  return (TIER_RANK[tier] ?? 0) >= TIER_RANK[need]
}

/**
 * The real check: metered features read the paid tier, everything else reads
 * the entitled tier.
 */
export function allows({ tier, paidTier }, feature) {
  return tierAllows(METERED.has(feature) ? paidTier : tier, feature)
}

export function featuresFor(tier, paidTier = tier) {
  return Object.fromEntries(
    Object.keys(FEATURE_TIER).map((f) => [f, allows({ tier, paidTier }, f)])
  )
}

/**
 * Resolve a user's current tier plus the context the UI needs to explain it.
 */
export async function resolveEntitlement(userId) {
  const [
    { data: tierData, error: tierErr },
    { data: paidData, error: paidErr },
    { data: subs },
  ] = await Promise.all([
    admin.rpc('entitled_tier', { p_user_id: userId }),
    admin.rpc('paid_tier', { p_user_id: userId }),
    admin
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (tierErr) throw new Error(`entitled_tier failed: ${tierErr.message}`)
  if (paidErr) throw new Error(`paid_tier failed: ${paidErr.message}`)

  const tier = tierData || 'free'
  const paidTier = paidData || 'free'

  // The subscription actually granting access right now, if any.
  const live = (subs || [])
    .filter(
      (s) =>
        ['active', 'authenticated', 'pending'].includes(s.status) &&
        (!s.current_end || new Date(s.current_end) > new Date())
    )
    .sort((a, b) => (b.plan?.rank ?? 0) - (a.plan?.rank ?? 0))[0] || null

  return {
    tier,
    // What they have actually bought, ignoring anything granted for free.
    paidTier,
    features: featuresFor(tier, paidTier),
    // 'pending' means Razorpay is retrying a failed charge. Access continues,
    // but the UI should say so before it turns into 'halted'.
    paymentRetrying: live?.status === 'pending',
    subscription: live
      ? {
          id: live.id,
          razorpaySubscriptionId: live.razorpay_subscription_id,
          status: live.status,
          planId: live.plan_id,
          planName: live.plan?.name ?? live.plan_id,
          period: live.plan?.period ?? 'monthly',
          currentEnd: live.current_end,
          // When the next charge falls due.
          chargeAt: live.charge_at,
          cancelAtCycleEnd: live.cancel_at_cycle_end,
          shortUrl: live.short_url,
        }
      : null,
  }
}

import { admin } from './supabase.js'

// Mirrors public.entitled_tier() in 0002_billing.sql. The SQL function is the
// canonical definition; this reads through it rather than reimplementing the
// rules, so the two cannot drift.

// Tier names match the customer-facing plan names on purpose, so a support
// question about "Growth" does not need translating to read the database.
export const TIER_RANK = { none: 0, starter: 1, growth: 2 }

// What each feature costs you in tier. Everything needs a paid plan — free
// accounts exist only to hold a trial and a card-less signup.
export const FEATURE_TIER = {
  carousels: 'starter',
  videos: 'starter',
  blink: 'growth',
}

/** The plan name a user must be on to unlock a feature, for error copy. */
export const PLAN_NAME = { starter: 'Starter', growth: 'Growth' }

export function tierAllows(tier, feature) {
  const need = FEATURE_TIER[feature]
  if (!need) return false
  return (TIER_RANK[tier] ?? 0) >= TIER_RANK[need]
}

export function featuresFor(tier) {
  return Object.fromEntries(Object.keys(FEATURE_TIER).map((f) => [f, tierAllows(tier, f)]))
}

/**
 * Resolve a user's current tier plus the context the UI needs to explain it.
 */
export async function resolveEntitlement(userId) {
  const [{ data: tierData, error: tierErr }, { data: profile }, { data: subs }] = await Promise.all([
    admin.rpc('entitled_tier', { p_user_id: userId }),
    admin.from('profiles').select('trial_ends_at').eq('id', userId).maybeSingle(),
    admin
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (tierErr) throw new Error(`entitled_tier failed: ${tierErr.message}`)

  const tier = tierData || 'none'
  const trialEndsAt = profile?.trial_ends_at || null
  const onTrial = Boolean(trialEndsAt && new Date(trialEndsAt) > new Date())

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
    features: featuresFor(tier),
    onTrial,
    trialEndsAt,
    trialDaysLeft: onTrial
      ? Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 86_400_000))
      : 0,
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
          // When the first charge was deferred to the end of a trial, this is
          // the date that actually matters to the customer.
          chargeAt: live.charge_at,
          cancelAtCycleEnd: live.cancel_at_cycle_end,
          shortUrl: live.short_url,
        }
      : null,
  }
}

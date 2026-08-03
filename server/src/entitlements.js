import { admin } from './supabase.js'

// Mirrors public.entitled_tier() in 0002_billing.sql. The SQL function is the
// canonical definition; this reads through it rather than reimplementing the
// rules, so the two cannot drift.

export const TIER_RANK = { none: 0, creator: 1, studio: 2 }

// What each feature costs you in tier. Everything needs a paid plan — free
// accounts exist only to hold a trial and a card-less signup.
export const FEATURE_TIER = {
  carousels: 'creator',
  videos: 'creator',
  blink: 'studio',
}

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
          currentEnd: live.current_end,
          cancelAtCycleEnd: live.cancel_at_cycle_end,
          shortUrl: live.short_url,
        }
      : null,
  }
}

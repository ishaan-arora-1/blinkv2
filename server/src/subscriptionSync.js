import { admin } from './supabase.js'
import { razorpay, toIso, razorpayMessage } from './razorpay.js'

/**
 * Write a Razorpay subscription object into our mirror table.
 *
 * Shared by the checkout verify call and the webhook handler so both paths
 * produce identical rows. The webhook is authoritative — verify just gets the
 * user through the door a few seconds sooner.
 *
 * user_id is resolved from the row we created at checkout time, falling back to
 * the note we stamped on the subscription. A webhook can arrive for a
 * subscription we have never seen (a retry that beats our own insert), and
 * dropping it would strand a paying customer.
 */
export async function syncSubscription(rzpSub, { userId = null } = {}) {
  if (!rzpSub?.id) return null

  const { data: existing } = await admin
    .from('subscriptions')
    .select('id, user_id, plan_id')
    .eq('razorpay_subscription_id', rzpSub.id)
    .maybeSingle()

  const resolvedUserId = existing?.user_id || userId || rzpSub.notes?.user_id || null
  if (!resolvedUserId) {
    console.warn(`[billing] subscription ${rzpSub.id} has no resolvable user_id — skipping sync`)
    return null
  }

  const planId = existing?.plan_id || (await planIdForRazorpayPlan(rzpSub.plan_id))
  if (!planId) {
    console.warn(`[billing] subscription ${rzpSub.id} references unknown plan ${rzpSub.plan_id}`)
    return null
  }

  const row = {
    user_id: resolvedUserId,
    plan_id: planId,
    razorpay_subscription_id: rzpSub.id,
    razorpay_customer_id: rzpSub.customer_id || null,
    status: rzpSub.status,
    current_start: toIso(rzpSub.current_start),
    current_end: toIso(rzpSub.current_end),
    charge_at: toIso(rzpSub.charge_at),
    ended_at: toIso(rzpSub.ended_at),
    // Razorpay does not echo this flag back, so preserve what we already know
    // unless the subscription has clearly terminated.
    ...(['cancelled', 'completed', 'expired'].includes(rzpSub.status)
      ? { cancel_at_cycle_end: false }
      : {}),
    short_url: rzpSub.short_url || null,
    notes: rzpSub.notes || {},
  }

  const { data, error } = await admin
    .from('subscriptions')
    .upsert(row, { onConflict: 'razorpay_subscription_id' })
    .select('*')
    .single()

  if (error) throw new Error(`subscription upsert failed: ${error.message}`)
  return data
}

async function planIdForRazorpayPlan(razorpayPlanId) {
  if (!razorpayPlanId) return null
  const { data } = await admin
    .from('plans')
    .select('id')
    .eq('razorpay_plan_id', razorpayPlanId)
    .maybeSingle()
  return data?.id || null
}

/**
 * Fetch the live state from Razorpay and mirror it. Used when we want the truth
 * rather than whatever a webhook payload happened to contain.
 */
export async function refreshSubscription(razorpaySubscriptionId, opts = {}) {
  try {
    const sub = await razorpay.subscriptions.fetch(razorpaySubscriptionId)
    return await syncSubscription(sub, opts)
  } catch (err) {
    console.error(`[billing] refresh failed for ${razorpaySubscriptionId}:`, razorpayMessage(err, err))
    return null
  }
}

/**
 * When an upgrade activates, retire the subscription it replaced so the user is
 * not billed for both. Stamped as notes.replaces at checkout time.
 */
export async function retireReplacedSubscription(rzpSub) {
  const replaces = rzpSub?.notes?.replaces
  if (!replaces || replaces === rzpSub.id) return

  try {
    await razorpay.subscriptions.cancel(replaces, false) // immediately, not at cycle end
    console.log(`[billing] cancelled ${replaces}, replaced by ${rzpSub.id}`)
  } catch (err) {
    // Already cancelled or completed is fine and common — the webhook may be a
    // retry of one we already handled.
    console.warn(`[billing] could not cancel replaced subscription ${replaces}:`, razorpayMessage(err, err))
  }
  await refreshSubscription(replaces)
}

import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { razorpay, verifySubscriptionSignature, razorpayMessage } from '../razorpay.js'
import { syncSubscription, refreshSubscription } from '../subscriptionSync.js'
import { resolveEntitlement } from '../entitlements.js'
import { wrap, badRequest, notFound, ApiError } from '../middleware/errors.js'

// requireAuth is applied where this router is mounted, so the rate limiter can
// key on req.user. Every route below can assume req.user exists.
export const billingRouter = Router()

// Billing can be wired up after the rest of the app is live. Until it is, say so
// clearly instead of failing somewhere deeper with a confusing Razorpay error.
billingRouter.use((_req, _res, next) => {
  if (!env.razorpay.configured) {
    return next(
      new ApiError(
        503,
        'billing_not_configured',
        'Payments are not set up yet. Everything else still works on your trial.'
      )
    )
  }
  next()
})

// Razorpay requires a finite cycle count, so "until cancelled" is expressed as
// roughly ten years of whichever cycle the plan bills on.
const TOTAL_COUNT = { monthly: 120, yearly: 10 }
const cyclesFor = (period) => TOTAL_COUNT[period] ?? 120

const LIVE_STATUSES = ['active', 'authenticated', 'pending']

// Razorpay rejects a start_at that is not comfortably in the future, and a
// trial with minutes left is not worth deferring for anyway.
const MIN_DEFERRAL_MS = 60 * 60 * 1000

/**
 * When the first charge should land.
 *
 * Someone who subscribes on day 3 of a 7-day trial was promised 7 free days, so
 * the mandate is authorised now and billing starts when the trial actually
 * ends. Razorpay holds the subscription in 'authenticated' until then, which
 * entitled_tier() already treats as granting access — so they keep working
 * throughout and simply start paying on the day they expected to.
 *
 * Returns null when there is no trial left, in which case billing starts now.
 */
async function firstChargeAt(userId) {
  const { data: profile } = await admin
    .from('profiles')
    .select('trial_ends_at')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.trial_ends_at) return null
  const endsAt = new Date(profile.trial_ends_at).getTime()
  if (endsAt - Date.now() < MIN_DEFERRAL_MS) return null

  return Math.floor(endsAt / 1000) // Razorpay wants unix seconds
}

/** Reuse one Razorpay customer per user across every subscription they create. */
async function ensureCustomer(userId) {
  const { data: profile } = await admin
    .from('profiles')
    .select('razorpay_customer_id, email, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.razorpay_customer_id) return profile.razorpay_customer_id

  let customer
  try {
    customer = await razorpay.customers.create({
      name: profile?.full_name || profile?.email || 'reelmint user',
      email: profile?.email || undefined,
      fail_existing: 0, // return the existing customer instead of erroring
      notes: { user_id: userId },
    })
  } catch (err) {
    throw new ApiError(502, 'razorpay_customer_failed', razorpayMessage(err, 'Could not set up billing.'))
  }

  await admin.from('profiles').update({ razorpay_customer_id: customer.id }).eq('id', userId)
  return customer.id
}

/**
 * Create a subscription and hand the browser what Checkout needs.
 *
 * Nothing is charged here — the user still has to authorize the mandate in the
 * Razorpay Checkout modal.
 */
billingRouter.post(
  '/subscriptions',
  wrap(async (req, res) => {
    const planId = String(req.body?.planId || '').trim()
    if (!planId) throw badRequest('Pick a plan.')

    const { data: plan } = await admin
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('active', true)
      .maybeSingle()

    if (!plan) throw notFound('That plan does not exist.')
    if (!plan.razorpay_plan_id) {
      throw new ApiError(
        503,
        'plan_not_configured',
        `The ${plan.name} plan is not connected to Razorpay yet. Set plans.razorpay_plan_id — see DEPLOY.md.`
      )
    }

    // Is there already something live? If so this is a plan change, and we mark
    // the new subscription as replacing the old one.
    const { data: liveSubs } = await admin
      .from('subscriptions')
      .select('razorpay_subscription_id, plan_id, status, current_end')
      .eq('user_id', req.user.id)
      .in('status', LIVE_STATUSES)

    const live = (liveSubs || []).filter((s) => !s.current_end || new Date(s.current_end) > new Date())
    const sameplan = live.find((s) => s.plan_id === planId)
    if (sameplan) {
      throw badRequest(`You are already on ${plan.name}.`)
    }
    const replaces = live[0]?.razorpay_subscription_id || null

    const customerId = await ensureCustomer(req.user.id)

    // Only honour the remaining trial on a first subscription. Someone changing
    // plans is already a customer, and deferring that charge would hand them
    // free time they have not earned.
    const startAt = replaces ? null : await firstChargeAt(req.user.id)

    let sub
    try {
      sub = await razorpay.subscriptions.create({
        plan_id: plan.razorpay_plan_id,
        customer_id: customerId,
        total_count: cyclesFor(plan.period),
        quantity: 1,
        customer_notify: 1,
        ...(startAt ? { start_at: startAt } : {}),
        notes: {
          user_id: req.user.id,
          plan_id: plan.id,
          ...(replaces ? { replaces } : {}),
        },
      })
    } catch (err) {
      throw new ApiError(
        502,
        'razorpay_subscription_failed',
        razorpayMessage(err, 'Could not start the subscription.')
      )
    }

    await syncSubscription(sub, { userId: req.user.id })

    res.json({
      subscriptionId: sub.id,
      razorpayKeyId: env.razorpay.keyId,
      shortUrl: sub.short_url,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price_paise / 100,
        currency: plan.currency,
        period: plan.period,
      },
      isPlanChange: Boolean(replaces),
      // So checkout can tell the user they are authorising now but paying later.
      firstChargeAt: startAt ? new Date(startAt * 1000).toISOString() : null,
    })
  })
)

/**
 * Called by the browser as soon as Checkout succeeds.
 *
 * This is a convenience so access appears immediately; the webhook is what we
 * actually trust. A forged call here fails the signature check, and even if it
 * somehow passed, the refresh below reads state straight from Razorpay.
 */
billingRouter.post(
  '/verify',
  wrap(async (req, res) => {
    const paymentId = String(req.body?.razorpay_payment_id || '')
    const subscriptionId = String(req.body?.razorpay_subscription_id || '')
    const signature = String(req.body?.razorpay_signature || '')

    if (!paymentId || !subscriptionId || !signature) {
      throw badRequest('Incomplete payment confirmation.')
    }

    // The subscription must be one of ours, or anyone could ask us to sync
    // someone else's.
    const { data: owned } = await admin
      .from('subscriptions')
      .select('id')
      .eq('razorpay_subscription_id', subscriptionId)
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (!owned) throw notFound('That subscription is not on your account.')

    if (!verifySubscriptionSignature({ paymentId, subscriptionId, signature })) {
      throw new ApiError(400, 'signature_mismatch', 'We could not verify that payment. Nothing was charged twice.')
    }

    await refreshSubscription(subscriptionId, { userId: req.user.id })
    const entitlement = await resolveEntitlement(req.user.id)

    res.json({ ok: true, entitlement })
  })
)

/**
 * Cancel at the end of the paid period — the user keeps what they paid for.
 */
billingRouter.post(
  '/cancel',
  wrap(async (req, res) => {
    const { data: live } = await admin
      .from('subscriptions')
      .select('razorpay_subscription_id, status, current_end')
      .eq('user_id', req.user.id)
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!live) throw notFound('You do not have an active subscription.')

    try {
      await razorpay.subscriptions.cancel(live.razorpay_subscription_id, true)
    } catch (err) {
      throw new ApiError(502, 'razorpay_cancel_failed', razorpayMessage(err, 'Could not cancel the subscription.'))
    }

    await admin
      .from('subscriptions')
      .update({ cancel_at_cycle_end: true })
      .eq('razorpay_subscription_id', live.razorpay_subscription_id)

    await refreshSubscription(live.razorpay_subscription_id, { userId: req.user.id })
    const entitlement = await resolveEntitlement(req.user.id)

    res.json({ ok: true, entitlement })
  })
)

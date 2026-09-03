import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { razorpay, verifySubscriptionSignature, razorpayMessage } from '../razorpay.js'
import { planBilling, razorpayMode } from '../planMode.js'
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
        'Payments are not set up yet. Photo carousels still work on the free tier.'
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

/*
 * Subscriptions bill from the moment they are authorised.
 *
 * There is deliberately no `start_at`. An earlier version deferred the first
 * charge to the end of the trial, and what the customer actually saw was a
 * token authorisation charge — about $0.50 to validate the mandate — followed
 * by the real amount days later, which reads like a double charge and invites a
 * dispute. Now that nothing is being deferred to, there is nothing to defer.
 *
 * Omitting start_at means the authorisation and the first payment are one
 * transaction, for exactly the amount on the pricing page, and access starts
 * the moment it settles. Buying and paying are the same event.
 */

/** Reuse one Razorpay customer per user across every subscription they create. */
/**
 * Does this failure mean an id we sent does not exist in this Razorpay mode?
 *
 * Razorpay answers the same sentence for a missing plan and a missing customer,
 * so the field is what separates them when it is given. Without a field the
 * description is all there is — and retrying with a fresh customer is safe
 * either way, because a plan id we cannot fix is checked before we get here.
 */
function isUnknownIdError(err) {
  const e = err?.error || err
  const description = String(e?.description || '')
  if (!/id provided does not exist|id provided is invalid/i.test(description)) return false
  return !e?.field || e.field === 'customer_id'
}

async function ensureCustomer(userId, { forceNew = false } = {}) {
  // A customer exists in one mode only. Reusing a live id against test keys
  // fails with "The id provided does not exist", which is true and unreadable
  // at a payment screen — so each mode gets its own column, exactly as plans do.
  const column = razorpayMode === 'test' ? 'razorpay_customer_id_test' : 'razorpay_customer_id'

  const { data: profile } = await admin
    .from('profiles')
    .select(`${column}, email, full_name`)
    .eq('id', userId)
    .maybeSingle()

  // `forceNew` is the recovery path: the stored id was rejected by Razorpay, so
  // whatever it is, it is not a customer this key can see. Mint a fresh one and
  // overwrite it rather than making the person wait for someone to notice.
  if (!forceNew && profile?.[column]) return profile[column]

  let customer
  try {
    customer = await razorpay.customers.create({
      name: profile?.full_name || profile?.email || 'Blink UGC user',
      email: profile?.email || undefined,
      fail_existing: 0, // return the existing customer instead of erroring
      notes: { user_id: userId },
    })
  } catch (err) {
    throw new ApiError(502, 'razorpay_customer_failed', razorpayMessage(err, 'Could not set up billing.'))
  }

  await admin.from('profiles').update({ [column]: customer.id }).eq('id', userId)
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

    // Resolved for the mode this process's key belongs to. Handing Razorpay a
    // plan id from the other mode fails at the payment step, in front of the
    // customer, so the mismatch is caught here instead.
    const { razorpayPlanId, priceMinor } = planBilling(plan)
    if (!razorpayPlanId) {
      throw new ApiError(
        503,
        'plan_not_configured',
        `The ${plan.name} plan is not connected to a Razorpay ${razorpayMode} plan yet. ` +
          `Set plans.${razorpayMode === 'test' ? 'razorpay_plan_id_test' : 'razorpay_plan_id'} — see DEPLOY.md.`
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

    const create = (customerId) =>
      // No start_at: the first cycle begins on authorisation, so Razorpay
      // collects the full plan amount as the authorisation payment.
      razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        customer_id: customerId,
        total_count: cyclesFor(plan.period),
        quantity: 1,
        customer_notify: 1,
        notes: {
          user_id: req.user.id,
          plan_id: plan.id,
          ...(replaces ? { replaces } : {}),
        },
      })

    let sub
    try {
      sub = await create(await ensureCustomer(req.user.id))
    } catch (err) {
      // A stored customer id Razorpay cannot see. It belongs to the other mode
      // or to a different account — which is what happens to every row written
      // before customers were split per mode, and to everyone's row if the keys
      // are ever pointed at a new account.
      //
      // Recovering costs one extra call and happens in the half second before
      // the checkout window opens. Not recovering means a customer who wants to
      // pay is told "The id provided does not exist" and there is nothing they
      // can do about it, because the broken value is on our side.
      if (!isUnknownIdError(err)) {
        throw new ApiError(502, 'razorpay_subscription_failed', razorpayMessage(err, 'Could not start the subscription.'))
      }

      try {
        sub = await create(await ensureCustomer(req.user.id, { forceNew: true }))
      } catch (retryErr) {
        throw new ApiError(
          502,
          'razorpay_subscription_failed',
          razorpayMessage(retryErr, 'Could not start the subscription.')
        )
      }
    }

    await syncSubscription(sub, { userId: req.user.id })

    res.json({
      subscriptionId: sub.id,
      razorpayKeyId: env.razorpay.keyId,
      shortUrl: sub.short_url,
      plan: {
        id: plan.id,
        name: plan.name,
        price: priceMinor / 100,
        currency: plan.currency,
        period: plan.period,
      },
      isPlanChange: Boolean(replaces),
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

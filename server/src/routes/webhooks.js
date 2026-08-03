import { Router } from 'express'
import express from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { verifyWebhookSignature } from '../razorpay.js'
import { syncSubscription, retireReplacedSubscription } from '../subscriptionSync.js'

export const webhooksRouter = Router()

/**
 * Razorpay webhook receiver.
 *
 * Three things matter here and each one has bitten someone before:
 *
 *  1. The signature is computed over the *raw* bytes. This route is mounted
 *     with express.raw ahead of the global express.json, because re-serialising
 *     a parsed body changes whitespace and key order and the HMAC no longer
 *     matches.
 *  2. Deliveries repeat. Razorpay retries on any non-2xx and occasionally sends
 *     duplicates anyway, so x-razorpay-event-id is stored as a primary key and a
 *     replay is a no-op.
 *  3. Status codes are instructions. 400 means "never send this again", 500
 *     means "please retry". Returning 200 on a failure silently loses money.
 */
webhooksRouter.post('/razorpay', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!env.razorpay.configured) {
    // 503 rather than 200: Razorpay retries, so a delivery that arrives before
    // the secret is set is not silently lost.
    console.warn('[webhook] received a delivery but Razorpay is not configured')
    return res.status(503).json({ error: 'billing not configured' })
  }

  const signature = req.get('x-razorpay-signature')
  const eventId = req.get('x-razorpay-event-id')
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('[webhook] rejected: bad signature')
    return res.status(400).json({ error: 'invalid signature' })
  }

  let payload
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'invalid json' })
  }

  const event = payload.event || 'unknown'
  const dedupeKey = eventId || `${event}:${payload.created_at}:${payload.payload?.subscription?.entity?.id || ''}`

  // Claim the event. A duplicate delivery collides on the primary key and we
  // acknowledge without reprocessing.
  const { error: claimError } = await admin
    .from('webhook_events')
    .insert({ id: dedupeKey, event, payload })

  if (claimError) {
    if (claimError.code === '23505') {
      console.log(`[webhook] ${event} (${dedupeKey}) already processed`)
      return res.json({ ok: true, duplicate: true })
    }
    console.error('[webhook] could not record event:', claimError.message)
    return res.status(500).json({ error: 'could not record event' })
  }

  try {
    await handleEvent(event, payload)
    await admin.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', dedupeKey)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[webhook] ${event} failed:`, err)
    await admin
      .from('webhook_events')
      .update({ error: String(err?.message || err) })
      .eq('id', dedupeKey)
    // Leave processed_at null and ask for a retry.
    res.status(500).json({ error: 'processing failed' })
  }
})

async function handleEvent(event, payload) {
  const subEntity = payload.payload?.subscription?.entity || null
  const paymentEntity = payload.payload?.payment?.entity || null

  switch (event) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.updated':
    case 'subscription.pending':
    case 'subscription.halted':
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.paused':
    case 'subscription.resumed': {
      if (!subEntity) break
      const row = await syncSubscription(subEntity)

      // A plan change only retires the old subscription once the new one is
      // genuinely live — never on mere authentication, or a failed upgrade
      // would leave the user with nothing.
      if (['subscription.activated', 'subscription.charged'].includes(event)) {
        await retireReplacedSubscription(subEntity)
      }

      if (paymentEntity) await recordPayment(paymentEntity, row)
      console.log(`[webhook] ${event} → ${subEntity.id} is ${subEntity.status}`)
      break
    }

    case 'payment.captured':
    case 'payment.failed': {
      if (paymentEntity) await recordPayment(paymentEntity, null)
      break
    }

    default:
      console.log(`[webhook] ${event} ignored`)
  }
}

async function recordPayment(payment, subscriptionRow) {
  let userId = subscriptionRow?.user_id || payment.notes?.user_id || null
  let subscriptionId = subscriptionRow?.id || null

  // A payment.captured for a subscription renewal arrives with no subscription
  // entity attached; walk back through the invoice's subscription id.
  if (!userId && payment.subscription_id) {
    const { data } = await admin
      .from('subscriptions')
      .select('id, user_id')
      .eq('razorpay_subscription_id', payment.subscription_id)
      .maybeSingle()
    userId = data?.user_id || null
    subscriptionId = data?.id || null
  }

  const { error } = await admin.from('payments').upsert(
    {
      user_id: userId,
      subscription_id: subscriptionId,
      razorpay_payment_id: payment.id,
      razorpay_invoice_id: payment.invoice_id || null,
      amount_paise: payment.amount ?? 0,
      currency: payment.currency || 'INR',
      status: payment.status || null,
      method: payment.method || null,
      raw: payment,
    },
    { onConflict: 'razorpay_payment_id' }
  )

  if (error) throw new Error(`payment upsert failed: ${error.message}`)
}

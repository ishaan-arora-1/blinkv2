import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from './env.js'

// Constructing the client with empty credentials throws, so it only exists once
// the keys do. Routes guard on env.razorpay.configured before touching it.
export const razorpay = env.razorpay.configured
  ? new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret })
  : null

// Constant-time compare so a signature check cannot be narrowed byte by byte.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8')
  const bb = Buffer.from(String(b), 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/**
 * Verify the handler payload Razorpay Checkout hands back after a subscription
 * is authorized.
 *
 * Note the operand order: for subscriptions it is payment_id|subscription_id.
 * For one-time orders it is order_id|payment_id — the other way round. Getting
 * this backwards produces a check that never passes.
 */
export function verifySubscriptionSignature({ paymentId, subscriptionId, signature }) {
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')
  return safeEqual(expected, signature)
}

/** Verify a webhook delivery against the raw request body. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !env.razorpay.webhookSecret) return false
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex')
  return safeEqual(expected, signature)
}

/** Razorpay sends unix seconds; the database wants timestamptz. */
export const toIso = (unixSeconds) =>
  unixSeconds ? new Date(Number(unixSeconds) * 1000).toISOString() : null

/**
 * Razorpay SDK errors carry the useful part in .error.description, buried under
 * a generic message. Surface the useful part.
 */
export function razorpayMessage(err, fallback) {
  return err?.error?.description || err?.description || err?.message || fallback
}

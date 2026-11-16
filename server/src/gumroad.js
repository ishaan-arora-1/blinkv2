import crypto from 'node:crypto'
import { admin } from './supabase.js'
import { env } from './env.js'

/**
 * Gumroad, which pings rather than signs.
 *
 * Razorpay posts an HMAC over the raw body; Gumroad posts a form and trusts
 * the URL to be secret. So the URL carries a token, compared in constant time,
 * and the payload's seller_id is checked against ours — two weak checks where
 * there used to be one strong one, which is the trade for the provider.
 *
 * Deliberately NOT trusting anything else in the body. The email and the price
 * are attacker-controlled if the token ever leaks, so the tier comes from
 * looking the permalink up in our own plans table rather than from any amount
 * in the payload.
 */

/** Ping and resource-subscription names that grant or keep access. */
const GRANTING = new Set(['sale', 'subscription_restarted', 'subscription_updated'])
/** The ones that end it. */
const ENDING = new Set(['cancellation', 'subscription_ended', 'refund', 'dispute'])

export function verifyToken(given) {
  const want = env.gumroad.webhookToken
  if (!want) return false
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(want)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** `true` only for a value Gumroad sends as the string "true". */
const isTrue = (v) => v === 'true' || v === true

/**
 * Which of our users this sale belongs to.
 *
 * The id we put on the checkout URL is the only reliable answer: Gumroad's
 * email is whatever the buyer typed at checkout, which is frequently not the
 * address they signed in with. Email is the fallback rather than the answer,
 * and a miss is left unresolved rather than guessed at — granting a plan to
 * the wrong account is worse than granting it late.
 */
async function resolveUser(body) {
  const fromUrl = body['url_params[user_id]'] || body.url_params?.user_id
  if (fromUrl) {
    const { data } = await admin.from('profiles').select('id').eq('id', fromUrl).maybeSingle()
    if (data?.id) return data.id
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!email) return null
  const { data } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  return data?.id || null
}

/** The plan this permalink sells, or null if it is not one of ours. */
async function resolvePlan(permalink) {
  if (!permalink) return null
  const { data } = await admin
    .from('plans')
    .select('id, name, tier')
    .eq('gumroad_permalink', permalink)
    .maybeSingle()
  return data || null
}

/**
 * Apply one ping. Returns a short string for the log, or throws to ask Gumroad
 * to retry — it retries on any non-2xx, so a database blip must not 200.
 */
export async function handlePing(body) {
  const event = body.resource_name || 'sale'

  if (env.gumroad.sellerId && body.seller_id && body.seller_id !== env.gumroad.sellerId) {
    return `ignored: seller ${body.seller_id} is not ours`
  }

  const permalink = body.product_permalink || body.permalink
  const plan = await resolvePlan(permalink)
  if (!plan) return `ignored: ${permalink} is not a Blink plan`

  const userId = await resolveUser(body)
  if (!userId) {
    // Loud, because this is a customer who has paid and cannot use it.
    console.error(`[gumroad] PAID BUT UNMATCHED — ${body.email} bought ${plan.id}, no account found`)
    return 'unmatched buyer'
  }

  const subId = body.subscription_id || null
  const ending = ENDING.has(event) || isTrue(body.cancelled) || isTrue(body.refunded) || isTrue(body.disputed)

  if (ending) {
    const q = admin.from('subscriptions').update({ status: 'cancelled', ended_at: new Date().toISOString() })
    await (subId ? q.eq('gumroad_subscription_id', subId) : q.eq('user_id', userId).eq('plan_id', plan.id))
    return `${event}: ${plan.id} ended for ${userId}`
  }

  if (!GRANTING.has(event)) return `ignored: ${event}`

  const row = {
    user_id: userId,
    plan_id: plan.id,
    status: 'active',
    gumroad_subscription_id: subId,
    gumroad_sale_id: body.sale_id || null,
    current_start: new Date().toISOString(),
    // Gumroad does not send the period end on a ping. A month from now keeps
    // entitled_tier()'s current_end check true until the next charge extends
    // it; a missed renewal lapses on its own rather than granting forever.
    current_end: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
    notes: { provider: 'gumroad', email: body.email || null },
  }

  const { error } = subId
    ? await admin.from('subscriptions').upsert(row, { onConflict: 'gumroad_subscription_id' })
    : await admin.from('subscriptions').insert(row)

  if (error) throw new Error(`could not record the sale: ${error.message}`)
  return `${event}: ${plan.id} active for ${userId}`
}

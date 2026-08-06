// Drives the real payment path end to end against Razorpay TEST mode: creates a
// subscription through our own API, checks the amount Razorpay is holding is the
// amount our pricing page quotes, replays the webhook Razorpay would send when
// the charge settles, and confirms the entitlement flips. Cleans up after itself.
//
//   node scripts/verify-payments.mjs
//
// Refuses to run against live keys. Everything here creates real objects at
// Razorpay, and the point of the exercise is that they are disposable.

import 'dotenv/config'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const API = process.env.VERIFY_API || 'http://localhost:8080'
const url = process.env.SUPABASE_URL
const keyId = process.env.RAZORPAY_KEY_ID || ''
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''

if (!keyId.startsWith('rzp_test_')) {
  console.error(`refusing to run against a non-test Razorpay key (${keyId.slice(0, 12)}…)`)
  process.exit(1)
}

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(url, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = `pay-check-${Date.now()}@example.com`
const password = `pw-${Math.random().toString(36).slice(2)}-A1!`
let userId

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw error
  userId = created.user.id

  const { data: session } = await anon.auth.signInWithPassword({ email, password })
  const auth = { Authorization: `Bearer ${session.session.access_token}` }
  const post = (path, body) =>
    fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  // ── what the pricing page quotes ──────────────────────────────────────────

  const { plans, billingEnabled } = await fetch(`${API}/api/plans`).then((r) => r.json())
  check('billing is configured', billingEnabled === true)
  const starter = plans.find((p) => p.tier === 'starter' && p.period === 'monthly')
  const growth = plans.find((p) => p.tier === 'growth' && p.period === 'monthly')
  check('both plans are on offer', Boolean(starter && growth),
    plans.map((p) => `${p.name} ${p.currency} ${p.price}`).join(', '))
  check('Starter is not priced as Growth', starter.price < growth.price,
    `${starter.price} < ${growth.price}`)
  check('plan copy no longer sells a trial',
    !/trial/i.test(JSON.stringify(plans)), 'no "trial" in any blurb or feature')

  // ── creating the subscription ─────────────────────────────────────────────

  const res = await post('/api/billing/subscriptions', { planId: starter.id })
  const body = await res.json()
  check('POST /api/billing/subscriptions succeeds', res.ok, `status ${res.status} ${JSON.stringify(body).slice(0, 200)}`)

  const subId = body.subscriptionId
  check('Razorpay returned a subscription id', /^sub_/.test(subId || ''), subId)
  check('checkout is handed the key id, not the secret', body.razorpayKeyId === keyId, body.razorpayKeyId)
  check('the quoted price matches the plans endpoint', body.plan.price === starter.price,
    `checkout ${body.plan.price} vs page ${starter.price}`)

  // Ask Razorpay directly what it thinks it is going to charge. This is the
  // check that catches a crossed plan id: our row can say "Starter" while the
  // id in it points at the Growth plan, and only Razorpay knows the difference.
  const rzpAuth = 'Basic ' + Buffer.from(`${keyId}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const remote = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}`, {
    headers: { Authorization: rzpAuth },
  }).then((r) => r.json())

  const plan = await fetch(`https://api.razorpay.com/v1/plans/${remote.plan_id}`, {
    headers: { Authorization: rzpAuth },
  }).then((r) => r.json())

  check('Razorpay holds the same amount we quoted',
    plan.item.amount === starter.priceMinor,
    `Razorpay ${plan.item.amount} vs quoted ${starter.priceMinor} (${plan.item.currency})`)
  check('Razorpay holds the same currency', plan.item.currency === starter.currency,
    `${plan.item.currency} vs ${starter.currency}`)
  check('the subscription bills immediately, with no deferred start',
    !remote.start_at || remote.start_at * 1000 < Date.now() + 60_000,
    remote.start_at ? new Date(remote.start_at * 1000).toISOString() : 'no start_at')
  check('it is tied to this user in Razorpay notes', remote.notes?.user_id === userId)

  const { data: mirrored } = await admin
    .from('subscriptions').select('status, plan_id').eq('razorpay_subscription_id', subId).maybeSingle()
  check('a mirror row was written locally', Boolean(mirrored), JSON.stringify(mirrored))
  check('the mirror row names the plan we asked for', mirrored?.plan_id === starter.id, mirrored?.plan_id)

  // Access is not granted by creating a subscription — only by paying for one.
  const beforePaying = await fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())
  check('unpaid subscription grants nothing yet', beforePaying.entitlement.features.videos === false,
    `tier "${beforePaying.entitlement.tier}", status "${mirrored?.status}"`)

  // ── a forged confirmation is refused ──────────────────────────────────────

  const forged = await post('/api/billing/verify', {
    razorpay_payment_id: 'pay_forged',
    razorpay_subscription_id: subId,
    razorpay_signature: 'deadbeef',
  })
  check('a bad signature on /verify is rejected', forged.status === 400, `status ${forged.status}`)

  const stillNothing = await fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())
  check('the forged attempt granted nothing', stillNothing.entitlement.features.videos === false)

  // ── the webhook Razorpay sends when the charge settles ────────────────────
  //
  // This is the event that actually turns money into access, so it is the one
  // worth replaying. Signed with the real secret; an unsigned copy is sent
  // first to prove the signature is what is trusted, not the payload.

  const event = {
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: subId,
          plan_id: remote.plan_id,
          status: 'active',
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          charge_at: Math.floor(Date.now() / 1000) + 30 * 86400,
          notes: { user_id: userId, plan_id: starter.id },
        },
      },
      payment: {
        entity: {
          id: `pay_verify_${Date.now()}`,
          amount: starter.priceMinor,
          currency: starter.currency,
          status: 'captured',
          method: 'card',
        },
      },
    },
  }
  const raw = JSON.stringify(event)
  const sign = (s) => crypto.createHmac('sha256', webhookSecret).update(s).digest('hex')

  const unsigned = await fetch(`${API}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' },
    body: raw,
  })
  check('an unsigned webhook is refused', unsigned.status === 400 || unsigned.status === 401,
    `status ${unsigned.status}`)

  const signed = await fetch(`${API}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
    body: raw,
  })
  check('a signed subscription.charged is accepted', signed.ok, `status ${signed.status}`)

  const paid = await fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())
  check('paying unlocks Starter', paid.entitlement.tier === 'starter', `tier "${paid.entitlement.tier}"`)
  check('paid: hook videos unlocked', paid.entitlement.features.videos === true)
  check('paid: animated carousels unlocked', paid.entitlement.features.animated === true)
  check('paid: image sets unlocked', paid.entitlement.features.sets === true)
  check('paid: Blink AI still needs Growth', paid.entitlement.features.blink === false)
  check('the account page can name the plan', paid.entitlement.subscription?.planName === 'Starter',
    paid.entitlement.subscription?.planName)

  const { data: payment } = await admin
    .from('payments').select('amount_minor, currency, status').eq('user_id', userId).maybeSingle()
  check('the payment was recorded for the account', payment?.amount_minor === starter.priceMinor,
    JSON.stringify(payment))

  // Razorpay retries deliveries; processing one twice must not double-charge
  // the books or flip anything back.
  const replay = await fetch(`${API}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
    body: raw,
  })
  const { count: payments } = await admin
    .from('payments').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  check('a replayed webhook is idempotent', replay.ok && payments === 1, `${payments} payment rows`)

  // ── cancelling ────────────────────────────────────────────────────────────
  //
  // Only half of this is reachable from a script. The webhook above moved our
  // side of the subscription to active, but at Razorpay it is still 'created' —
  // nobody authorised a mandate, because doing so means a human in the Checkout
  // modal with a card. Razorpay therefore refuses to cancel it, which is
  // correct of it.
  //
  // So what is checked here is the half that is ours: that a refusal from the
  // gateway comes back as a clean 502 carrying Razorpay's own words, rather
  // than a 500 with a stack trace, and that nothing local is torn down on the
  // strength of a cancellation that did not happen. The happy path is one
  // Razorpay API call away from this and is exercised by the manual smoke test
  // in DEPLOY.md.

  const cancelled = await post('/api/billing/cancel', {})
  const cancelBody = await cancelled.json()
  check('a gateway refusal surfaces as 502, not a crash', cancelled.status === 502,
    `status ${cancelled.status}`)
  check('the refusal quotes Razorpay rather than swallowing it',
    /billing cycle/i.test(cancelBody?.error?.message || ''), cancelBody?.error?.message)

  const afterFailedCancel = await fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())
  check('a failed cancel leaves access alone', afterFailedCancel.entitlement.features.videos === true,
    `tier "${afterFailedCancel.entitlement.tier}"`)
  const { data: notCancelled } = await admin
    .from('subscriptions').select('cancel_at_cycle_end').eq('razorpay_subscription_id', subId).maybeSingle()
  check('a failed cancel is not recorded as one', notCancelled?.cancel_at_cycle_end === false,
    `cancel_at_cycle_end ${notCancelled?.cancel_at_cycle_end}`)
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId)
    console.log(`\ncleaned up ${email}`)
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

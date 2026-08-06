// Does paying actually grant access, and does not-paying actually not?
//
//   node scripts/verify-access-grant.mjs
//
// A card cannot be typed by a script, so the thing being tested is everything
// downstream of the card: the webhook deliveries Razorpay sends as a
// subscription moves through its lifecycle, replayed with real signatures
// against the real endpoint, asserting what /api/me grants after each one.
//
// The sequence below is Razorpay's, not ours — created, authenticated, charged,
// pending on a failed retry, halted when retries run out, cancelled, completed.
// Each step asserts both directions: what the customer gains, and what they lose.

import 'dotenv/config'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const API = process.env.VERIFY_API || 'http://localhost:8080'
const url = process.env.SUPABASE_URL
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(url, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = `grant-check-${Date.now()}@example.com`
const password = `pw-${Math.random().toString(36).slice(2)}-A1!`
let userId

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sec = (d) => Math.floor(d / 1000)

try {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw error
  userId = created.user.id

  const { data: session } = await anon.auth.signInWithPassword({ email, password })
  const auth = { Authorization: `Bearer ${session.session.access_token}` }
  const me = () => fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())

  const { plans } = await fetch(`${API}/api/plans`).then((r) => r.json())
  const starter = plans.find((p) => p.tier === 'starter' && p.period === 'monthly')
  const growth = plans.find((p) => p.tier === 'growth' && p.period === 'monthly')

  // Razorpay plan ids, read from our own table the same way the sync does.
  const { data: planRows } = await admin
    .from('plans').select('id, razorpay_plan_id, razorpay_plan_id_test')
  const rzpPlan = (id) => {
    const r = planRows.find((p) => p.id === id)
    return r.razorpay_plan_id_test || r.razorpay_plan_id
  }

  const subId = `sub_grant_${Date.now()}`

  /** Deliver a webhook exactly as Razorpay would, signed over the raw bytes. */
  async function deliver(event, { status, planId, currentEnd, payment, id = subId }) {
    const body = {
      event,
      created_at: sec(Date.now()),
      payload: {
        subscription: {
          entity: {
            id,
            plan_id: rzpPlan(planId),
            status,
            current_start: sec(Date.now()),
            current_end: currentEnd === undefined ? sec(Date.now() + 30 * 864e5) : currentEnd,
            notes: { user_id: userId, plan_id: planId },
          },
        },
        ...(payment ? { payment: { entity: payment } } : {}),
      },
    }
    const raw = JSON.stringify(body)
    const res = await fetch(`${API}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex'),
        // A fresh event id each time, or the dedupe key swallows the delivery.
        'x-razorpay-event-id': `evt_${Math.random().toString(36).slice(2)}`,
      },
      body: raw,
    })
    return res
  }

  // ── before anything is paid ───────────────────────────────────────────────

  const start = await me()
  check('before paying: free', start.entitlement.tier === 'free', `tier "${start.entitlement.tier}"`)
  check('before paying: Starter features locked', start.entitlement.features.videos === false)

  // ── created: a subscription exists, nothing is paid ───────────────────────

  await deliver('subscription.updated', { status: 'created', planId: 'starter' })
  const afterCreated = await me()
  check('status "created" grants nothing', afterCreated.entitlement.features.videos === false,
    `tier "${afterCreated.entitlement.tier}"`)

  // ── authenticated: mandate approved, charge settling ──────────────────────

  await deliver('subscription.authenticated', { status: 'authenticated', planId: 'starter' })
  const afterAuth = await me()
  check('status "authenticated" grants Starter', afterAuth.entitlement.tier === 'starter',
    `tier "${afterAuth.entitlement.tier}"`)

  // ── charged: the money actually arrived ───────────────────────────────────

  const payRes = await deliver('subscription.charged', {
    status: 'active',
    planId: 'starter',
    payment: {
      id: `pay_grant_${Date.now()}`,
      amount: starter.priceMinor,
      currency: starter.currency,
      status: 'captured',
      method: 'card',
    },
  })
  check('subscription.charged is accepted', payRes.ok, `status ${payRes.status}`)

  const paid = await me()
  check('paying grants exactly Starter', paid.entitlement.tier === 'starter', `tier "${paid.entitlement.tier}"`)
  check('paid: hook videos on', paid.entitlement.features.videos === true)
  check('paid: animated carousels on', paid.entitlement.features.animated === true)
  check('paid: image sets on', paid.entitlement.features.sets === true)
  check('paid: Blink AI still off', paid.entitlement.features.blink === false)
  check('paid: not flagged as retrying', paid.entitlement.paymentRetrying === false)

  const { data: pay } = await admin
    .from('payments').select('amount_minor, currency, status').eq('user_id', userId).maybeSingle()
  check('the money is recorded against the account',
    pay?.amount_minor === starter.priceMinor && pay?.status === 'captured', JSON.stringify(pay))

  // ── pending: a renewal failed, Razorpay is retrying ───────────────────────

  await deliver('subscription.pending', { status: 'pending', planId: 'starter' })
  const pending = await me()
  check('a failing renewal keeps access during retries', pending.entitlement.features.videos === true,
    `tier "${pending.entitlement.tier}"`)
  check('...and says so, so the UI can warn', pending.entitlement.paymentRetrying === true)

  // ── halted: retries exhausted ─────────────────────────────────────────────

  await deliver('subscription.halted', { status: 'halted', planId: 'starter' })
  const halted = await me()
  check('halted revokes the paid tier', halted.entitlement.features.videos === false,
    `tier "${halted.entitlement.tier}"`)
  check('halted still leaves the free tier', halted.entitlement.features.carousels === true)

  // ── an expired period revokes even while "active" ─────────────────────────

  await deliver('subscription.updated', {
    status: 'active', planId: 'starter', currentEnd: sec(Date.now() - 864e5),
  })
  const expired = await me()
  check('a period that has ended revokes access', expired.entitlement.features.videos === false,
    `tier "${expired.entitlement.tier}"`)

  // ── upgrading ─────────────────────────────────────────────────────────────

  await deliver('subscription.updated', { status: 'active', planId: 'starter' })
  const backOnStarter = await me()
  check('restored to Starter', backOnStarter.entitlement.tier === 'starter')

  const upgradeId = `${subId}_up`
  await deliver('subscription.charged', {
    id: upgradeId,
    status: 'active',
    planId: 'growth',
    payment: {
      id: `pay_up_${Date.now()}`,
      amount: growth.priceMinor,
      currency: growth.currency,
      status: 'captured',
      method: 'card',
    },
  })
  const upgraded = await me()
  check('upgrading grants Growth', upgraded.entitlement.tier === 'growth', `tier "${upgraded.entitlement.tier}"`)
  check('upgraded: Blink AI unlocked', upgraded.entitlement.features.blink === true)

  // ── cancelling and completing ─────────────────────────────────────────────

  for (const [event, status] of [['subscription.cancelled', 'cancelled'], ['subscription.completed', 'completed']]) {
    await deliver(event, { status, planId: 'growth', id: upgradeId })
  }
  await deliver('subscription.cancelled', { status: 'cancelled', planId: 'starter' })

  const gone = await me()
  check('after cancelling: no paid features', gone.entitlement.features.blink === false && gone.entitlement.features.videos === false,
    `tier "${gone.entitlement.tier}"`)
  check('after cancelling: free tier intact', gone.entitlement.features.carousels === true)

  // ── paused ────────────────────────────────────────────────────────────────
  //
  // The webhook handler has a case for this, so it is a state we expect to see.

  await deliver('subscription.updated', { status: 'active', planId: 'starter' })
  const beforePause = await me()
  check('re-activated for the pause test', beforePause.entitlement.features.videos === true)

  const pauseRes = await deliver('subscription.paused', { status: 'paused', planId: 'starter' })
  const paused = await me()
  check('subscription.paused is accepted', pauseRes.ok, `status ${pauseRes.status}`)
  check('a paused subscription does not keep paid access', paused.entitlement.features.videos === false,
    `tier "${paused.entitlement.tier}"`)
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId)
    console.log(`\ncleaned up ${email}`)
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

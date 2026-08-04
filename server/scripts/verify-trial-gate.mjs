// Proves the trial cannot reach Blink AI: creates a throwaway account with a
// live trial, then asks the real API what it is entitled to and tries the real
// generate endpoint. Deletes the account whatever happens.
//
//   node scripts/verify-trial-gate.mjs

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const API = process.env.VERIFY_API || 'http://localhost:8080'
const url = process.env.SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(url, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = `trial-gate-${Date.now()}@example.com`
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

  const { data: profile } = await admin
    .from('profiles').select('trial_ends_at').eq('id', userId).single()
  const daysLeft = (new Date(profile.trial_ends_at) - Date.now()) / 86_400_000
  check('new account gets a live trial', daysLeft > 6, `${daysLeft.toFixed(1)} days left`)

  const { data: tier } = await admin.rpc('entitled_tier', { p_user_id: userId })
  check('entitled_tier() during trial is starter', tier === 'starter', `got "${tier}"`)

  const { data: session } = await anon.auth.signInWithPassword({ email, password })
  const token = session.session.access_token
  const auth = { Authorization: `Bearer ${token}` }

  const me = await (await fetch(`${API}/api/me`, { headers: auth })).json()
  check('/api/me reports starter', me.entitlement.tier === 'starter', `tier "${me.entitlement.tier}"`)
  check('/api/me says onTrial', me.entitlement.onTrial === true)
  check('carousels allowed on trial', me.entitlement.features.carousels === true)
  check('hook videos allowed on trial', me.entitlement.features.videos === true)
  check('blink BLOCKED on trial', me.entitlement.features.blink === false)

  const gen = await fetch(`${API}/api/veo/generate`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'a cat selling software', aspect: '9:16', duration: 4 }),
  })
  const body = await gen.json().catch(() => ({}))
  check('POST /api/veo/generate returns 403', gen.status === 403, `status ${gen.status}`)
  check('403 names the Growth plan', /Growth/.test(body?.error?.message || ''), body?.error?.message)

  // /status is deliberately not tier-gated, so a lapsed customer can still
  // collect a render they paid for. It is scoped to the caller instead, and a
  // trial account can never own a row here because /generate is gated.
  const status = await fetch(`${API}/api/veo/status/00000000-0000-0000-0000-000000000000`, { headers: auth })
  check('trial owns no generations to poll', status.status === 404, `status ${status.status}`)

  const { count } = await admin
    .from('blinks').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  check('no blink row was created', count === 0, `${count} rows`)

  // Regression guard: narrowing the trial must not touch paying customers.
  for (const [planId, wantBlink] of [['starter', false], ['growth', true]]) {
    await admin.from('subscriptions').delete().eq('user_id', userId)
    const { error: subErr } = await admin.from('subscriptions').insert({
      user_id: userId,
      plan_id: planId,
      razorpay_subscription_id: `sub_verify_${planId}_${Date.now()}`,
      status: 'active',
      current_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    if (subErr) throw subErr
    const paid = await (await fetch(`${API}/api/me`, { headers: auth })).json()
    check(
      `paid ${planId} → blink ${wantBlink ? 'allowed' : 'blocked'}`,
      paid.entitlement.tier === planId && paid.entitlement.features.blink === wantBlink,
      `tier "${paid.entitlement.tier}", blink ${paid.entitlement.features.blink}`
    )
  }
  await admin.from('subscriptions').delete().eq('user_id', userId)
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId)
    console.log(`\ncleaned up ${email}`)
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

// Proves the three tiers are what they claim to be: creates a throwaway account,
// walks it free -> starter -> growth, and after each step asks the real API and
// the real database what it is allowed to do. Deletes the account whatever
// happens.
//
//   node scripts/verify-tiers.mjs
//
// Both halves matter and they check different things. The API calls prove
// requireFeature() says no; the direct inserts prove RLS says no, which is the
// only thing standing between a free account and an image set, because the
// browser writes those rows itself without ever asking the server.

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

const email = `tier-check-${Date.now()}@example.com`
const password = `pw-${Math.random().toString(36).slice(2)}-A1!`
let userId

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Put the account on a plan, or on none of them. */
async function setPlan(planId) {
  await admin.from('subscriptions').delete().eq('user_id', userId)
  if (!planId) return
  const { error } = await admin.from('subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    razorpay_subscription_id: `sub_verify_${planId}_${Date.now()}`,
    status: 'active',
    current_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  })
  if (error) throw error
}

try {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw error
  userId = created.user.id

  const { data: session } = await anon.auth.signInWithPassword({ email, password })
  const token = session.session.access_token
  const auth = { Authorization: `Bearer ${token}` }
  // The user's own client, subject to RLS exactly like the browser is.
  const asUser = createClient(url, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: auth },
  })

  const me = () => fetch(`${API}/api/me`, { headers: auth }).then((r) => r.json())
  const post = (path, body) =>
    fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  // ── free ──────────────────────────────────────────────────────────────────

  const { data: profile } = await admin
    .from('profiles').select('trial_ends_at').eq('id', userId).single()
  check('no trial is stamped on a new account', profile.trial_ends_at === null,
    `trial_ends_at ${profile.trial_ends_at}`)

  const { data: tier } = await admin.rpc('entitled_tier', { p_user_id: userId })
  check('entitled_tier() with no plan is free', tier === 'free', `got "${tier}"`)

  const free = await me()
  check('/api/me reports the free tier', free.entitlement.tier === 'free', `tier "${free.entitlement.tier}"`)
  check('free: photo carousels allowed', free.entitlement.features.carousels === true)
  check('free: hook videos blocked', free.entitlement.features.videos === false)
  check('free: animated carousels blocked', free.entitlement.features.animated === false)
  check('free: custom image sets blocked', free.entitlement.features.sets === false)
  check('free: Blink AI blocked', free.entitlement.features.blink === false)

  const blink = await post('/api/veo/generate', { prompt: 'a cat selling software', aspect: '9:16', duration: 4 })
  const blinkBody = await blink.json().catch(() => ({}))
  check('free: POST /api/veo/generate is 403', blink.status === 403, `status ${blink.status}`)
  check('free: that 403 names Growth', /Growth/.test(blinkBody?.error?.message || ''), blinkBody?.error?.message)

  const anim = await post('/api/animated/generate', { topic: 'why routines fail', slideCount: 3, characterId: 'mila' })
  const animBody = await anim.json().catch(() => ({}))
  check('free: POST /api/animated/generate is 403', anim.status === 403, `status ${anim.status}`)
  check('free: that 403 names Starter', /Starter/.test(animBody?.error?.message || ''), animBody?.error?.message)

  // RLS, not the API. This is the browser's own write path.
  const { error: setErr } = await asUser.from('image_sets').insert({ user_id: userId, name: 'nope' })
  check('free: RLS refuses an image_sets insert', Boolean(setErr), setErr?.message || 'insert SUCCEEDED')

  const { count: leaked } = await admin
    .from('image_sets').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  check('free: no image set row exists', leaked === 0, `${leaked} rows`)

  // Nothing metered should have been created by any of the above.
  for (const table of ['blinks', 'carousels']) {
    const { count } = await admin
      .from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId)
    check(`free: no ${table} row was created`, count === 0, `${count} rows`)
  }

  // ── starter ───────────────────────────────────────────────────────────────

  await setPlan('starter')
  const starter = await me()
  check('starter: tier reported', starter.entitlement.tier === 'starter', `tier "${starter.entitlement.tier}"`)
  check('starter: carousels allowed', starter.entitlement.features.carousels === true)
  check('starter: hook videos allowed', starter.entitlement.features.videos === true)
  check('starter: animated carousels allowed', starter.entitlement.features.animated === true)
  check('starter: custom image sets allowed', starter.entitlement.features.sets === true)
  check('starter: Blink AI still blocked', starter.entitlement.features.blink === false)

  const { data: setRow, error: setOk } = await asUser
    .from('image_sets').insert({ user_id: userId, name: 'yes' }).select('id').single()
  check('starter: RLS allows an image_sets insert', !setOk, setOk?.message)
  if (setRow) await admin.from('image_sets').delete().eq('id', setRow.id)

  const stillBlocked = await post('/api/veo/generate', { prompt: 'x', aspect: '9:16', duration: 4 })
  check('starter: POST /api/veo/generate is 403', stillBlocked.status === 403, `status ${stillBlocked.status}`)

  // ── growth ────────────────────────────────────────────────────────────────

  await setPlan('growth')
  const growth = await me()
  check('growth: tier reported', growth.entitlement.tier === 'growth', `tier "${growth.entitlement.tier}"`)
  for (const f of ['carousels', 'videos', 'animated', 'sets', 'blink']) {
    check(`growth: ${f} allowed`, growth.entitlement.features[f] === true)
  }

  // ── cancelled ─────────────────────────────────────────────────────────────
  //
  // The end of a subscription is a drop to free, not a lockout. This is the
  // regression that would be easiest to reintroduce and least likely to be
  // noticed, because it only shows up to a customer who already left.

  await setPlan(null)
  const lapsed = await me()
  check('after cancelling: back on free, not locked out', lapsed.entitlement.tier === 'free',
    `tier "${lapsed.entitlement.tier}"`)
  check('after cancelling: photo carousels still allowed', lapsed.entitlement.features.carousels === true)
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId)
    console.log(`\ncleaned up ${email}`)
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

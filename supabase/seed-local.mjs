/**
 * Seeds two accounts into a LOCAL Supabase stack.
 *
 *   node supabase/seed-local.mjs
 *
 * Refuses to run against anything that is not localhost, because the only thing
 * separating "seed a test account" from "write rows into production" is the URL
 * in an env file.
 *
 *   dev@blinkugc.test    subscribed to Starter — can make animated carousels
 *   trial@blinkugc.test  on the free trial    — animated carousels are blocked
 *
 * Both with password `devpassword`. The pair is the point: the whole reason
 * paid_tier() exists is that these two accounts have the same entitled tier and
 * must behave differently.
 */
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(API.replace(/\/+$/, ''))) {
  console.error(`refusing to seed a non-local Supabase: ${API}`)
  process.exit(1)
}

const h = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
}

async function rest(path, init = {}) {
  const res = await fetch(`${API}/rest/v1/${path}`, { ...init, headers: { ...h, ...init.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function createUser(email) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email,
      password: 'devpassword',
      email_confirm: true,
      user_metadata: { full_name: email.split('@')[0] },
    }),
  })
  const body = await res.json()
  if (res.ok) return body.id

  // Already there from a previous run — look the id up instead of failing.
  const list = await fetch(`${API}/auth/v1/admin/users?per_page=200`, { headers: h }).then((r) => r.json())
  const found = (list.users || []).find((u) => u.email === email)
  if (!found) throw new Error(`could not create or find ${email}: ${JSON.stringify(body).slice(0, 200)}`)
  return found.id
}

const brand = (userId, appName) => ({
  user_id: userId,
  app_name: appName,
  category: 'skincare',
  verb: 'stick to a routine',
  tagline: 'The three-step routine you will actually finish.',
  onboarded: true,
})

// ── paid account ──
const paidId = await createUser('dev@blinkugc.test')
await rest('brands?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify(brand(paidId, 'Aurelia')),
})
// on_conflict names the column to upsert on; without it a re-run collides on
// the unique razorpay id instead of updating the row.
await rest('subscriptions?on_conflict=razorpay_subscription_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({
    user_id: paidId,
    plan_id: 'starter',
    razorpay_subscription_id: `sub_local_${paidId.slice(0, 8)}`,
    status: 'active',
    current_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  }),
})
// Expire the trial rather than clearing it — the column is NOT NULL, and a
// past date is what a customer who subscribed and moved on actually looks like.
await rest(`profiles?id=eq.${paidId}`, {
  method: 'PATCH',
  body: JSON.stringify({ trial_ends_at: new Date(Date.now() - 864e5).toISOString() }),
})

// ── trial account ──
const trialId = await createUser('trial@blinkugc.test')
await rest('brands?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify(brand(trialId, 'Northbound')),
})
await rest(`profiles?id=eq.${trialId}`, {
  method: 'PATCH',
  body: JSON.stringify({ trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString() }),
})

const check = async (id) =>
  (await rest(`rpc/entitled_tier`, { method: 'POST', body: JSON.stringify({ p_user_id: id }) })) +
  ' / ' +
  (await rest(`rpc/paid_tier`, { method: 'POST', body: JSON.stringify({ p_user_id: id }) }))

console.log('seeded — password for both is "devpassword"')
console.log(`  dev@blinkugc.test    entitled/paid = ${await check(paidId)}   → animated allowed`)
console.log(`  trial@blinkugc.test  entitled/paid = ${await check(trialId)}   → animated blocked`)

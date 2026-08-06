/**
 * Seeds three accounts into a LOCAL Supabase stack.
 *
 *   node supabase/seed-local.mjs
 *
 * Refuses to run against anything that is not localhost, because the only thing
 * separating "seed a test account" from "write rows into production" is the URL
 * in an env file.
 *
 *   free@blinkugc.test    no subscription     — photo carousels only
 *   dev@blinkugc.test     Starter             — + hook videos, animated, own sets
 *   growth@blinkugc.test  Growth              — + Blink AI
 *
 * All with password `devpassword`. One per tier is the point: every gate in the
 * product is a comparison between two of these three accounts, and the free one
 * is the account most of the UI has never been looked at as.
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

async function seed(email, appName, planId) {
  const id = await createUser(email)
  // The signup trigger has already made this account its first brand, so this
  // fills that row in rather than upserting. It cannot upsert: since 0011 there
  // is deliberately no unique constraint on user_id for ON CONFLICT to name.
  await rest(`brands?user_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(brand(id, appName)),
  })
  // Clear first, always. entitled_tier() takes the highest-ranked live
  // subscription, so one forgotten row from an afternoon of manual testing
  // silently promotes the account and the seed reports a tier it did not
  // create. Owning the whole set is the only way this stays true on a re-run.
  await rest(`subscriptions?user_id=eq.${id}`, { method: 'DELETE' })

  if (planId) {
    await rest('subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: id,
        plan_id: planId,
        razorpay_subscription_id: `sub_local_${planId}_${id.slice(0, 8)}`,
        status: 'active',
        current_end: new Date(Date.now() + 30 * 864e5).toISOString(),
      }),
    })
  }
  return id
}

const accounts = [
  ['free@blinkugc.test', 'Northbound', null, 'photo carousels only'],
  ['dev@blinkugc.test', 'Aurelia', 'starter', '+ videos, animated, own sets'],
  ['growth@blinkugc.test', 'Halcyon', 'growth', '+ Blink AI'],
]

const check = async (id) =>
  (await rest(`rpc/entitled_tier`, { method: 'POST', body: JSON.stringify({ p_user_id: id }) })) +
  '/' +
  (await rest(`rpc/paid_tier`, { method: 'POST', body: JSON.stringify({ p_user_id: id }) }))

console.log('seeded — password for all three is "devpassword"')
for (const [email, appName, planId, note] of accounts) {
  const id = await seed(email, appName, planId)
  console.log(`  ${email.padEnd(22)} entitled/paid = ${(await check(id)).padEnd(16)} ${note}`)
}

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.argv[2]

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) throw listErr
const user = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
if (!user) {
  console.log('no auth user for', EMAIL)
  console.log('emails present:', list.users.map((u) => u.email).join(', '))
  process.exit(0)
}
console.log('auth user:', { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, confirmed: user.email_confirmed_at })

const { data: profile, error: pErr } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle()
console.log('profile:', pErr?.message ?? profile)

const { data: subs, error: sErr } = await admin
  .from('subscriptions')
  .select('*, plan:plans(*)')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
console.log('subscriptions:', sErr?.message ?? JSON.stringify(subs, null, 2))

for (const fn of ['entitled_tier', 'paid_tier']) {
  const { data, error } = await admin.rpc(fn, { p_user_id: user.id })
  console.log(`${fn}:`, error ? `ERROR ${error.message}` : data)
}

const { data: plans } = await admin.from('plans').select('*').order('rank')
console.log('plans:', JSON.stringify(plans, null, 2))

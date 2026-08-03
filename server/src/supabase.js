import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

// Service-role client. Bypasses RLS entirely, so every query it makes must
// scope by user_id by hand — the database will not do it for you here.
export const admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Verifying a token means asking Supabase, which is a network hop. Requests
// arrive in bursts (the Blink AI poller alone is one every 6s), so hold the
// answer briefly. TTL is short enough that a revoked session dies quickly.
const TOKEN_TTL_MS = 60_000
const tokenCache = new Map()

function pruneCache() {
  if (tokenCache.size < 500) return
  const now = Date.now()
  for (const [k, v] of tokenCache) if (v.expires <= now) tokenCache.delete(k)
}

export async function userFromToken(token) {
  const hit = tokenCache.get(token)
  if (hit && hit.expires > Date.now()) return hit.user

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null

  pruneCache()
  tokenCache.set(token, { user: data.user, expires: Date.now() + TOKEN_TTL_MS })
  return data.user
}

export function forgetToken(token) {
  tokenCache.delete(token)
}

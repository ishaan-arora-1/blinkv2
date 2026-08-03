import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The anon key is meant to be public — it grants nothing on its own. Row level
// security is what protects the data, which is why every table in
// supabase/migrations has policies on it.
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Google sends the user back with the auth code in the URL; this reads
        // and clears it.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

export const SUPABASE_URL = url

// Reachable from the console while developing, for inspecting sessions and
// running ad-hoc queries. import.meta.env.DEV is replaced at build time, so
// this block is stripped from production output entirely.
if (import.meta.env.DEV && supabase) {
  globalThis.__supabase = supabase
}

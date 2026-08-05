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

/**
 * True only in a dev server pointed at a `supabase start` stack.
 *
 * Gates the email sign-in on the landing page. Google OAuth cannot complete
 * against a local Supabase, so without it there is no way into the app locally.
 *
 * Both halves are load-bearing, for different reasons. The URL test is the
 * correctness one: it must never be true against a hosted project. The
 * `import.meta.env.DEV` test is what makes it *disappear* — Vite replaces that
 * identifier with the literal `false` at build time, so the whole expression
 * folds to false and the minifier drops the sign-in component and its contents.
 *
 * The URL test alone was not enough. It is a runtime regex, so a production
 * build kept the component and shipped a placeholder password in the bundle
 * where anyone could read it.
 */
export const isLocalSupabase =
  import.meta.env.DEV &&
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(url || '').replace(/\/+$/, ''))

// Reachable from the console while developing, for inspecting sessions and
// running ad-hoc queries. import.meta.env.DEV is replaced at build time, so
// this block is stripped from production output entirely.
if (import.meta.env.DEV && supabase) {
  globalThis.__supabase = supabase
}

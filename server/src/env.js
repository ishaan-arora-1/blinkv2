import 'dotenv/config'

// Fail at boot rather than on the first request that needs a missing value.
// Railway restarts a crashed deploy loudly; a 500 an hour later is quieter and
// much worse.

function required(name, { allowMissingInDev = false } = {}) {
  const v = process.env[name]
  if (v && v.trim()) return v.trim()
  if (allowMissingInDev && process.env.NODE_ENV !== 'production') return ''
  missing.push(name)
  return ''
}

function optional(name, fallback = '') {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

const missing = []

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '8080')),

  // Where the browser app is served from. Drives CORS and is the origin the
  // server pulls creator reference stills from when conditioning a generation.
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:5199'),
  // Comma-separated extra origins (preview deploys, custom domains).
  extraOrigins: optional('EXTRA_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    // Bypasses RLS. Never send this to a browser.
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // Billing and generation are optional at boot so the app can be stood up in
  // stages — auth and the trial work on their own. A route that needs a missing
  // integration answers 503 with a clear reason rather than the server refusing
  // to start, which would take sign-in down too.
  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID'),
    keySecret: optional('RAZORPAY_KEY_SECRET'),
    webhookSecret: optional('RAZORPAY_WEBHOOK_SECRET'),
  },

  google: {
    // The whole point of this server: this key used to ship in the JS bundle.
    apiKey: optional('GOOGLE_AI_KEY'),
    model: optional('GOOGLE_AI_MODEL', 'veo-3.1-generate-preview'),
  },
}

env.razorpay.configured = Boolean(
  env.razorpay.keyId && env.razorpay.keySecret && env.razorpay.webhookSecret
)
env.google.configured = Boolean(env.google.apiKey)

export const allowedOrigins = [env.webOrigin, ...env.extraOrigins]

if (missing.length) {
  console.error(
    `\n  Missing required environment variables:\n${missing.map((m) => `    · ${m}`).join('\n')}\n\n` +
      `  Copy server/.env.example to server/.env and fill it in (see DEPLOY.md).\n`
  )
  process.exit(1)
}

// Say plainly at boot what is and is not wired up, so a 503 later is never a
// surprise.
if (!env.razorpay.configured) {
  console.warn(
    '  ⚠ Razorpay is not configured — subscriptions and webhooks will return 503.\n' +
      '    Trials still work, so sign-in and the app are fully usable.'
  )
}
if (!env.google.configured) {
  console.warn('  ⚠ GOOGLE_AI_KEY is not set — Blink AI generation will return 503.')
}

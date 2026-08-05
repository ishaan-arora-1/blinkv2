import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { env, allowedOrigins, isOriginAllowed } from './env.js'
import { razorpayMode } from './planMode.js'
import { meRouter } from './routes/me.js'
import { plansRouter } from './routes/plans.js'
import { billingRouter } from './routes/billing.js'
import { webhooksRouter } from './routes/webhooks.js'
import { veoRouter } from './routes/veo.js'
import { animatedRouter } from './routes/animated.js'
import { requireAuth } from './middleware/auth.js'
import { notFoundHandler, errorHandler } from './middleware/errors.js'

const app = express()

// Railway terminates TLS in front of us. Without this, req.ip is the proxy's
// address and every client shares one rate-limit bucket.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet())

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header: server-to-server, curl, health checks.
      if (!origin) return cb(null, true)
      if (isOriginAllowed(origin)) return cb(null, true)
      // Deny by omitting the header rather than throwing. Throwing turns a
      // routine cross-origin probe into a 500 and a stack trace in the logs,
      // while the browser-visible outcome is identical: no allow-origin header,
      // request blocked.
      //
      // Logged with the allowlist alongside it, because the usual cause is a
      // near-miss (trailing slash, http vs https, wrong subdomain) and seeing
      // both strings together makes it obvious.
      console.warn(`[cors] blocked ${origin} — allowed: ${allowedOrigins.join(', ') || '(none)'}`)
      cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
)

// The allowlist and integration flags are reported here deliberately. None of
// it is secret — the origins are public URLs and the flags are booleans — and
// having it one curl away turns "the API is unreachable" from a guessing game
// into a diff between two strings.
app.get('/health', (req, res) =>
  res.json({
    ok: true,
    service: 'blink-ugc-api',
    env: env.nodeEnv,
    time: new Date().toISOString(),
    allowedOrigins,
    yourOrigin: req.get('origin') || null,
    originAllowed: req.get('origin') ? isOriginAllowed(req.get('origin')) : null,
    integrations: { razorpay: env.razorpay.configured, googleVeo: env.google.configured },
    // Which Razorpay mode the deployed key belongs to. Not secret — it is a
    // property of the key's prefix — and it is the one thing worth checking
    // after a deploy, because a test key in production takes no money and a live
    // key in staging takes real money.
    razorpayMode: env.razorpay.configured ? razorpayMode : null,
  })
)

// Webhooks mount before the JSON parser: the signature is computed over the raw
// bytes, and parsing then re-serialising breaks it.
app.use('/api/webhooks', webhooksRouter)

// Product images arrive base64-encoded in the generate call.
app.use(express.json({ limit: '15mb' }))

// Rate limiting is two layers, and the order matters.
//
// The IP layer sits in front of requireAuth, because token verification itself
// costs a round trip and an unauthenticated flood would otherwise be free. The
// user layer sits behind it, where req.user actually exists — keying on IP
// alone would let one office network exhaust everybody's budget, and keying on
// user alone would be unreachable for a caller with no token.

// A single IPv6 customer is typically handed a whole /64, so keying on the full
// address lets one client rotate through billions of them. Collapse to the /64.
function ipKey(ip) {
  if (!ip) return 'unknown'
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (!addr.includes(':')) return addr
  return addr.split(':').slice(0, 4).join(':') + '::/64'
}

const base = (windowMs, max, message, keyGenerator) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message } },
    keyGenerator,
  })

const byIp = (windowMs, max, message = 'Slow down a moment.') =>
  base(windowMs, max, message, (req) => ipKey(req.ip))

const byUser = (windowMs, max, message = 'Slow down a moment.') =>
  base(windowMs, max, message, (req) => req.user?.id || ipKey(req.ip))

app.use('/api', byIp(60_000, 300, 'Too many requests. Try again shortly.'))

app.use('/api/plans', plansRouter)
app.use('/api/me', requireAuth, byUser(60_000, 120), meRouter)
app.use('/api/billing', requireAuth, byUser(60_000, 20, 'Too many billing requests. Try again shortly.'), billingRouter)
// Generous: the Blink AI poller legitimately calls /status every 6 seconds, and
// a user may have three renders in flight.
app.use('/api/veo', requireAuth, byUser(60_000, 90, 'Too many requests. Try again shortly.'), veoRouter)
// Same shape as Blink AI: the browser polls /status while a carousel renders,
// so the budget has to cover a poll every few seconds per carousel in flight.
app.use('/api/animated', requireAuth, byUser(60_000, 90, 'Too many requests. Try again shortly.'), animatedRouter)

app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(env.port, () => {
  console.log(`blink-ugc-api listening on :${env.port} (${env.nodeEnv})`)
  console.log(`  allowed origins: ${allowedOrigins.join(', ')}`)
  if (env.razorpay.configured) {
    // Stated at boot because the two modes are indistinguishable at a glance
    // afterwards, and the cost of assuming wrong runs in both directions: a test
    // key in production silently collects nothing, a live key in a sandbox
    // charges people for real.
    console.log(`  razorpay: ${razorpayMode.toUpperCase()} mode`)
  }
})

// Animated carousels keep working after the response has been sent, so a
// rejection can surface with no request to attach it to. Node's default for
// that is to exit the process — one user's failed slide upload would take the
// API down for everyone. Log it and stay up; the route already records the
// failure on the row the client is polling.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.stack || reason)
})

// Railway sends SIGTERM on redeploy. Finish in-flight requests first — one of
// them may be mid-webhook.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  })
}

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { env, allowedOrigins } from './env.js'
import { meRouter } from './routes/me.js'
import { plansRouter } from './routes/plans.js'
import { billingRouter } from './routes/billing.js'
import { webhooksRouter } from './routes/webhooks.js'
import { veoRouter } from './routes/veo.js'
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
      if (allowedOrigins.includes(origin)) return cb(null, true)
      // Deny by omitting the header rather than throwing. Throwing turns a
      // routine cross-origin probe into a 500 and a stack trace in the logs,
      // while the browser-visible outcome is identical: no allow-origin header,
      // request blocked.
      console.warn(`[cors] blocked origin ${origin}`)
      cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
)

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'reelmint-api', env: env.nodeEnv, time: new Date().toISOString() })
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

app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(env.port, () => {
  console.log(`reelmint-api listening on :${env.port} (${env.nodeEnv})`)
  console.log(`  allowed origins: ${allowedOrigins.join(', ')}`)
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

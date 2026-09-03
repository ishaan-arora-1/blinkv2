/**
 * The Meta pixel.
 *
 * Exists so paid traffic can be measured and optimised toward. Without it Meta
 * can only see link clicks, which means it optimises for people who click ads
 * rather than for people who sign up — and none of the traffic can be
 * retargeted or turned into a lookalike afterwards. That is the difference
 * between buying customers and buying clicks.
 *
 * Loaded the same way PostHog is: on demand, with events queued until it
 * arrives, and a complete no-op when the id is absent. Local development leaves
 * VITE_META_PIXEL_ID unset, so nothing from a dev machine lands in the ad
 * account's numbers.
 */

const pixelId = import.meta.env.VITE_META_PIXEL_ID

export const isConfigured = Boolean(pixelId)

const SRC = 'https://connect.facebook.net/en_US/fbevents.js'

let ready = false
let loading = null
const pending = []

/**
 * Meta's own snippet, which is a stub that records calls into `fbq.queue` and
 * replays them once the real script lands. Reproduced rather than pasted into
 * index.html so it is not fetched at all on a visit that never needs it.
 */
function bootstrap() {
  if (window.fbq) return
  const fbq = function (...args) {
    fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args)
  }
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq

  const s = document.createElement('script')
  s.async = true
  s.src = SRC
  document.head.appendChild(s)
}

function send(fn) {
  if (!isConfigured) return
  if (ready) return fn(window.fbq)

  pending.push(fn)
  if (loading) return

  loading = new Promise((resolve) => {
    try {
      bootstrap()
      window.fbq('init', pixelId)
      ready = true
      for (const queued of pending) queued(window.fbq)
      pending.length = 0
    } catch {
      // A blocker eating fbevents.js is the normal case, not an incident.
      // Drop the events; analytics must never be why someone cannot use this.
      pending.length = 0
    }
    resolve()
  })
}

/**
 * A screen view.
 *
 * Fired per route rather than per document load, because the app is a hash
 * router and the document loads exactly once — a pixel left to its own devices
 * would report one PageView for a session that visited eight screens.
 */
export function metaPageView() {
  send((fbq) => fbq('track', 'PageView'))
}

/**
 * One of Meta's standard events — Lead, CompleteRegistration,
 * InitiateCheckout, Purchase, Subscribe.
 *
 * Standard names matter: they are the only ones Ads Manager will let you
 * optimise delivery toward or report a cost-per against. A custom name is
 * something you can count and nothing you can bid on.
 */
export function metaTrack(event, params) {
  send((fbq) => fbq('track', event, params))
}

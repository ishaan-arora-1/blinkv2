import { useEffect, useRef } from 'react'
import { metaPageView, metaTrack } from './meta.js'

// PostHog. Answers "who came to the site, and which pages did they look at",
// and — because it can tie a session to a Supabase user id — "which of them
// went on to sign up and pay".
//
// The project key is public by design: it can only write events, never read
// them. That is what makes it safe to inline into the bundle like the Supabase
// anon key.
const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

// No key means every function here is a no-op. That is deliberate rather than
// an oversight guard: local `.env` leaves the key out, so development traffic
// and half-finished features never land in the production numbers.
export const isConfigured = Boolean(key)

// ── loading ──
// posthog-js is 92kB gzipped, which is half again the size of the rest of the
// app. Importing it normally would put all of that in front of first paint to
// serve something the visitor did not come here for. So it is loaded on demand
// and the events raised in the meantime wait in `pending`.
//
// Every event is built *before* it is queued, never inside the deferred send —
// a pageview that read window.location at flush time would report whichever
// route the person had reached by then, not the one it was raised for.
let posthog = null
let loading = null
const pending = []

function send(fn) {
  if (!isConfigured) return
  if (posthog) return fn(posthog)

  pending.push(fn)
  if (loading) return

  loading = import('posthog-js')
    .then(({ default: ph }) => {
      ph.init(key, {
        api_host: host,
        // The app is a hash router, so the URL path never changes. PostHog's
        // automatic pageview would fire once on load and then never again, and
        // every visit in the dashboard would read as a single visit to `/`.
        // capturePageview() below sends them instead, one per route.
        capture_pageview: false,
        // Time-on-page still works: this fires when the tab is closed, and it
        // is independent of how the pageview itself was sent.
        capture_pageleave: true,
      })
      posthog = ph
      for (const queued of pending) queued(ph)
      pending.length = 0
    })
    .catch(() => {
      // An ad blocker eating the chunk is the normal case, not an incident.
      // Drop the events and stop retrying; analytics must never be the reason
      // someone cannot use the product.
      pending.length = 0
    })
}

// Ids in the URL would otherwise make every carousel and every video its own
// row in the Pages report — thousands of rows, each with one view, and no way
// to see that `/carousel/:id` is the second most visited page on the site.
function normalise(route) {
  return route.replace(/^\/(carousel|video|blink)\/[^/]+$/, '/$1/:id')
}

/**
 * One `$pageview` per route.
 *
 * `$pathname` is the property PostHog's own Pages report groups by, and with a
 * hash router it is always `/`. Overriding it with the route is what makes that
 * report say `/blink` and `/pricing` rather than one giant `/`.
 */
export function capturePageview(route) {
  const path = normalise(route)
  const props = { $current_url: window.location.href, $pathname: path, route: path }
  send(ph => ph.capture('$pageview', props))
  metaPageView()
}

/**
 * Attach the session to a real account, so the anonymous visit that started on
 * the landing page and the signed-in usage that followed are one person in the
 * dashboard rather than two strangers.
 */
export function identifyUser(user) {
  if (!user?.id) return
  const { id } = user
  const props = { email: user.email, name: user.user_metadata?.full_name || user.name }
  send(ph => ph.identify(id, props))
}

/**
 * Called on sign-out. Without it the next person to use the browser inherits
 * the previous one's identity — which matters on shared and demo machines.
 */
export function resetUser() {
  send(ph => ph.reset())
}

/**
 * A custom event, and optionally the Meta standard event it corresponds to.
 *
 * Two names for one thing because the two tools want different things from it.
 * PostHog wants a name you can read in a funnel a year from now
 * (`checkout_started`); Meta wants one of its own dozen standard names, because
 * those are the only events Ads Manager will optimise delivery toward. Raising
 * both from one call is what stops the two from drifting apart.
 *
 *   track('checkout_started', { tier: 'studio' }, { meta: 'InitiateCheckout' })
 */
export function track(event, props, { meta, metaParams } = {}) {
  send(ph => ph.capture(event, props))
  if (meta) metaTrack(meta, metaParams ?? props)
}

// Supabase hands back the same user object on a fresh sign-up and on the
// thousandth sign-in, so "is this a new account" has to be read off how old it
// is. A few minutes is wide enough to survive a slow OAuth round trip and
// narrow enough that signing in tomorrow is not counted as signing up again.
const NEW_ACCOUNT_MS = 5 * 60 * 1000

function isNewAccount(user) {
  const created = user?.created_at || user?.createdAt
  if (!created) return false
  const ms = typeof created === 'number' ? created : Date.parse(created)
  return Number.isFinite(ms) && Date.now() - ms < NEW_ACCOUNT_MS
}

/**
 * Wires the calls above into the app's lifecycle. Called once, from App.
 *
 * The signed-in check is load-bearing rather than cosmetic. An anonymous
 * visitor arriving at blinkugc.com has no hash, so the router reports
 * `/dashboard` — but what they are actually looking at is the landing page.
 * Recorded literally, every first-time visit would look like a visit to the
 * studio, and the landing page would appear to get no traffic at all.
 */
export function useAnalytics({ route, authStatus, user }) {
  // Both of these render for signed-out visitors, so without naming them here
  // they would be filed as '/landing' and the ad page's traffic would be
  // indistinguishable from the main page's — which is the one number the ad
  // spend exists to produce.
  const screen =
    route === '/ad' || route === '/go'
      ? route
      : // 'loading' is the half-second before Supabase says whether a stored
        // session exists. Sending nothing until it resolves is what stops every
        // signed-in refresh from also counting as a landing page view.
        authStatus === 'loading'
        ? null
        : authStatus === 'authenticated'
          ? route
          : '/landing'

  useEffect(() => {
    if (screen) capturePageview(screen)
  }, [screen])

  const identified = useRef(null)
  const userId = user?.id ?? null

  useEffect(() => {
    if (userId && identified.current !== userId) {
      identified.current = userId
      identifyUser(user)

      // The conversion an ad is actually buying. Raised here rather than in the
      // sign-in handler because OAuth leaves and re-enters the app: the redirect
      // back from Google is a fresh page load, and any event fired before it
      // would be fired in a document that no longer exists by the time it lands.
      if (isNewAccount(user)) {
        track('signed_up', { method: 'google' }, { meta: 'CompleteRegistration' })
      }
    } else if (!userId && identified.current) {
      // Only on an actual sign-out. Resetting on the initial null would throw
      // away the anonymous id that links this visit back to the ad or search
      // result the person arrived from.
      identified.current = null
      resetUser()
    }
  }, [userId, user])
}

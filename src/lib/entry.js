/**
 * Where this visit came from and what it came to buy, remembered across the
 * OAuth round trip.
 *
 * Someone who clicked a priced button used to sign in and land in onboarding,
 * then a studio, then a lock, then a page of four plans. Four screens between
 * deciding to pay and being able to. But by the time any of those screens
 * render, the page they decided on is three redirects ago and everything it
 * knew is gone — Google's redirect reloads the document. So the button leaves a
 * note, and the screens after it read it.
 *
 * Written by both landing pages now. /go leaves it on arrival, because every
 * button there sells the same tier; / leaves it on the click, because the plan
 * grid sells three and only the pressed one is a decision.
 *
 * localStorage rather than a variable for exactly that reason, and rather than
 * sessionStorage because the OAuth round trip can land in a different tab.
 */

const KEY = 'blink.entry'

// A note is about the visit it was written in, not about this browser forever.
// Without an expiry, someone who bounced off the ad in March and came back
// through a search in June would be ambushed by a checkout screen for a
// decision they made once and abandoned.
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * `tier` is what this visit came to buy; `intent` is the same tier while it is
 * still unspent. They are separate fields because they end at different
 * moments — the intent is spent at the checkout, the tier is still needed a
 * screen later to decide where to land — and clearing one must not erase the
 * other.
 */
function write(source, tier) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ source, tier, intent: tier, at: Date.now() }))
  } catch {
    // Private mode, or storage disabled. They still get the product; they just
    // walk the same path as everyone else.
  }
}

/**
 * Called by the ad landing page on arrival.
 *
 * `intent` is the tier every button there is selling, or null for a visit that
 * has not committed to anything.
 */
export function markAdEntry(intent = null) {
  write('ad', intent)
}

/**
 * Called by a plan button on the main landing page, at the moment it is pressed.
 *
 * Not on arrival, unlike the ad page: / sells three tiers and a free one, so
 * until somebody presses a button this visit has decided nothing, and writing a
 * note on page view would put a checkout in front of someone who came to read.
 */
export function markPlanIntent(tier) {
  if (tier) write('plan', tier)
}

// The sources that may write a note. Checked on read so an unrecognised or
// half-written value is ignored rather than trusted — and listed rather than
// waved through, so a note from a future version of this file cannot drive a
// checkout this one does not understand.
const SOURCES = new Set(['ad', 'plan'])

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const note = JSON.parse(raw)
    if (!note || !SOURCES.has(note.source)) return null
    if (Date.now() - (note.at || 0) > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return note
  } catch {
    return null
  }
}

function clear() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * The tier this visitor arrived intending to buy, if they have not been shown
 * the checkout yet.
 *
 * Read without consuming: the checkout screen it selects is rendered on every
 * pass through App until they either pay or say no, and a read that cleared the
 * note would take the screen away on its own second render.
 */
export function pendingIntent() {
  return read()?.intent || null
}

/**
 * They paid, or they said no. Either way the checkout has been answered.
 *
 * Only the intent is spent — the note itself stays, because the hop it drives
 * (landing on Blink AI rather than the studio) happens two screens later.
 * Clearing the whole thing here would send someone who just paid for Blink AI
 * to a dashboard instead of to Blink AI.
 */
export function clearIntent() {
  const note = read()
  if (!note) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...note, intent: null }))
  } catch {
    /* nothing to do */
  }
}

/** Where a given tier's buyer should land: the feature they paid for. */
function routeForTier(tier) {
  if (tier === 'studio' || tier === 'agency') return '/blink'
  if (tier === 'creator') return '/videos'
  return null
}

/**
 * The route this visit should land on instead of the studio, consumed so it
 * steers one screen and never again.
 *
 * Read off the tier rather than the intent, because the intent has already been
 * spent at the checkout by the time this is asked. Someone who bought Creator
 * lands on hook videos; someone who bought Studio lands on Blink AI. Sending
 * both to Blink AI would drop the Creator customer straight onto a lock.
 *
 * An ad visit with no tier still lands on Blink AI — that is what the ad was
 * about, whether or not they bought it on the way in.
 */
export function consumeEntryRoute() {
  const note = read()
  if (!note) return null
  clear()
  return routeForTier(note.tier) || (note.source === 'ad' ? '/blink' : null)
}

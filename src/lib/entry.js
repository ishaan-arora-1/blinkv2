/**
 * Where this visit came from and what it came to buy, remembered across the
 * OAuth round trip.
 *
 * Someone who clicked a $49 button on the ad page used to sign in and land in
 * onboarding, then a studio, then a lock, then a page of four plans. Four
 * screens between deciding to pay and being able to. But by the time any of
 * those screens render, the ad page is three redirects ago and everything it
 * knew is gone — Google's redirect reloads the document. So the ad page leaves
 * a note, and the screens after it read it.
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
 * Called by the ad landing page.
 *
 * `intent` is the tier the button they pressed was selling, or null for a
 * visit that has not committed to anything.
 */
export function markAdEntry(intent = null) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ source: 'ad', intent, at: Date.now() }))
  } catch {
    // Private mode, or storage disabled. They still get the product; they just
    // walk the same path as everyone else.
  }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const note = JSON.parse(raw)
    if (!note || note.source !== 'ad') return null
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

/**
 * Whether this visit should land on Blink AI rather than the studio, consumed
 * so it steers one screen and never again.
 *
 * Separate from the intent because the two end at different moments: the intent
 * is spent at the checkout, this is spent at the first screen after onboarding.
 */
export function consumeAdEntry() {
  const note = read()
  if (!note) return false
  clear()
  return true
}

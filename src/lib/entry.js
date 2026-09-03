/**
 * Where this visit came from, remembered across the OAuth round trip.
 *
 * Someone who clicked an ad about Blink AI and signed in used to land in the
 * studio — a sidebar of features they did not click for, with the one they did
 * click for behind a lock they had not been told about yet. That is the leak
 * the ad page cannot fix on its own, because by the time it matters the ad page
 * is three redirects ago.
 *
 * So the ad page leaves a note. Google's redirect reloads the document and
 * throws away everything in memory, which is why this is localStorage and not
 * a variable.
 */

const KEY = 'blink.entry'

/** Called by the ad landing page, on arrival. */
export function markAdEntry() {
  try {
    localStorage.setItem(KEY, 'ad')
  } catch {
    // Private mode, or storage disabled. The visitor still gets the product;
    // they just land where everyone else does.
  }
}

/**
 * Read the note and tear it up.
 *
 * Consumed rather than merely read, so it steers the first screen after signing
 * up and never again — a flag that survived would hijack every visit to the
 * dashboard for as long as the browser kept it.
 */
export function consumeAdEntry() {
  try {
    if (localStorage.getItem(KEY) !== 'ad') return false
    localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}

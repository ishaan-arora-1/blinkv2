/**
 * Sending somebody to Gumroad to pay.
 *
 * There is no SDK and no server call: a Gumroad membership is bought at a URL,
 * so "checkout" is a link with the buyer stapled to it.
 *
 * `user_id` is the whole integration on our side. Gumroad echoes URL
 * parameters back on the Ping as url_params, and that is how the webhook knows
 * which account just paid — the email on the sale is whatever the buyer typed
 * at checkout, which is often not the one they signed in with.
 *
 * `wanted=true` opens the purchase form directly rather than the product page,
 * so the click after the click is "Pay" rather than "I want this!".
 */
const BASE = import.meta.env.VITE_GUMROAD_BASE || 'https://ishaana.gumroad.com'

export function gumroadUrl(plan, user) {
  if (!plan?.gumroad) return null
  const u = new URL(`${BASE}/l/${plan.gumroad}`)
  u.searchParams.set('wanted', 'true')
  if (user?.id) u.searchParams.set('user_id', user.id)
  if (user?.email) u.searchParams.set('email', user.email)
  return u.toString()
}

/**
 * Leave for Gumroad in this tab rather than a new one.
 *
 * A popup is what a blocker eats, and the return trip matters: Gumroad sends
 * the buyer back here afterwards, and a tab they came from is a tab with a
 * stale entitlement sitting in it.
 */
export function goToGumroad(plan, user) {
  const url = gumroadUrl(plan, user)
  if (!url) return false
  window.location.assign(url)
  return true
}

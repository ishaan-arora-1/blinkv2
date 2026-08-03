import { env } from './env.js'

/**
 * Razorpay keeps test and live completely separate: different keys, different
 * plans, different plan ids. A live key cannot see a test plan and a test key
 * cannot see a live one — the API just answers "The ID provided is invalid or
 * could not be found" at the moment a customer tries to pay.
 *
 * So the plans table carries both, and which one is correct is decided by the
 * key this process was started with rather than by a separate setting. A second
 * setting is a second thing to forget, and the failure it causes is a customer
 * being charged from the wrong mode.
 */
export const isTestMode = env.razorpay.keyId.startsWith('rzp_test_')

export const razorpayMode = isTestMode ? 'test' : 'live'

/**
 * The Razorpay plan id and price that go together for the current mode.
 *
 * Price travels with the id deliberately. The two are one fact — Razorpay
 * charges the amount attached to the plan it was handed — and reading the id
 * from one mode while quoting the price from the other is exactly the
 * discrepancy this split exists to prevent.
 *
 * Test falls back to the live values when no override is set, which is the
 * common case of a plan priced identically in both modes.
 */
export function planBilling(plan) {
  if (!plan) return { razorpayPlanId: null, priceMinor: null }

  if (isTestMode && plan.razorpay_plan_id_test) {
    return {
      razorpayPlanId: plan.razorpay_plan_id_test,
      priceMinor: plan.price_minor_test ?? plan.price_minor,
    }
  }

  return { razorpayPlanId: plan.razorpay_plan_id, priceMinor: plan.price_minor }
}

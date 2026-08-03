import { api } from './api.js'
import { money } from './money.js'

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let scriptPromise = null

/** Load Razorpay Checkout once, on demand rather than on every page load. */
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = CHECKOUT_SRC
    s.async = true
    s.onload = () => resolve(window.Razorpay)
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('Could not load the payment window. Check your connection or any ad blocker.'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export class CheckoutDismissed extends Error {
  constructor() {
    super('Payment window closed.')
    this.name = 'CheckoutDismissed'
  }
}

/**
 * Subscribe to a plan.
 *
 * The server creates the Razorpay subscription (we never hold the key secret),
 * Checkout collects the mandate, and the server verifies the signature before
 * anything is believed. The webhook is what ultimately confirms it — this path
 * just gets the user in without waiting for that round trip.
 */
export async function subscribeToPlan(planId, { user } = {}) {
  const Razorpay = await loadCheckout()

  const created = await api('/api/billing/subscriptions', {
    method: 'POST',
    body: { planId },
  })

  return new Promise((resolve, reject) => {
    let settled = false

    const rzp = new Razorpay({
      key: created.razorpayKeyId,
      subscription_id: created.subscriptionId,
      name: 'Blink UGC',
      // Shown inside the Razorpay checkout modal, so it must match what the
      // customer is actually about to be charged, currency and all.
      description: `${created.plan.name} — ${money(created.plan.price, created.plan.currency)}/${
        created.plan.period === 'yearly' ? 'year' : 'month'
      }`,
      image: undefined,
      prefill: {
        name: user?.fullName || undefined,
        email: user?.email || undefined,
      },
      theme: { color: '#c9a4ff' },
      handler: async (response) => {
        settled = true
        try {
          const verified = await api('/api/billing/verify', {
            method: 'POST',
            body: {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            },
          })
          resolve(verified)
        } catch (err) {
          reject(err)
        }
      },
      modal: {
        ondismiss: () => {
          // Not an error — the user simply closed the window. The subscription
          // stays in 'created' and is never charged.
          if (!settled) reject(new CheckoutDismissed())
        },
      },
    })

    rzp.on('payment.failed', (resp) => {
      settled = true
      reject(new Error(resp?.error?.description || 'The payment failed. Nothing was charged.'))
    })

    rzp.open()
  })
}

export function cancelSubscription() {
  return api('/api/billing/cancel', { method: 'POST' })
}

export function fetchPlans() {
  return api('/api/plans')
}

export function fetchPayments() {
  return api('/api/me/payments')
}

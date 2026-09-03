import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans, subscribeToPlan, CheckoutDismissed } from '../lib/razorpay.js'
import { money } from '../lib/money.js'
import { PLAN_NAME } from '../lib/tiers.js'

/**
 * One plan, buyable where it is needed.
 *
 * The locked pages used to send people to /pricing, which put a page of four
 * plans and a billing-period toggle between someone and the one plan they had
 * already decided to buy — a comparison screen at the exact moment their intent
 * peaked, offering them a cheaper tier that does not include the thing they
 * came for. This is the same card and the same Razorpay flow, in the place the
 * decision is actually made.
 *
 * On success it refreshes the account rather than navigating. The feature
 * behind the lock is on the page that rendered this, so re-reading the
 * entitlement swaps the lock for the feature where the person is already
 * looking. Sending them to a dashboard afterwards would make them find their
 * way back to what they just paid for.
 */
export default function PlanCard({ tier, onPurchased }) {
  const { entitlement, user, refreshAccount } = useAuth()

  const [plan, setPlan] = useState(null)
  const [billingEnabled, setBillingEnabled] = useState(true)
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((r) => {
        if (!alive) return
        const monthly = (r.plans || []).find((p) => p.tier === tier && p.period === 'monthly')
        setPlan(monthly || null)
        setBillingEnabled(r.billingEnabled !== false)
        setState(monthly ? 'ready' : 'error')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [tier])

  async function buy() {
    if (!plan || busy) return
    setBusy(true)
    setError(null)
    try {
      await subscribeToPlan(plan.id, { user })
      // The lock and the feature are both on the page above this one, so the
      // entitlement is the only thing that has to change for it to open.
      await refreshAccount()
      onPurchased?.()
    } catch (err) {
      // Closing the checkout window is not a failure and must not be reported
      // as one — nothing was charged and nothing went wrong.
      if (!(err instanceof CheckoutDismissed)) setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Nothing to show and nothing to buy. The caller keeps its own link to the
  // full plans page, which is the fallback when this cannot render.
  if (state === 'error') return null
  if (state === 'loading') {
    return (
      <div className="card plan featured" style={{ minHeight: 260 }}>
        <span className="tick">Loading…</span>
      </div>
    )
  }

  const name = plan.name || PLAN_NAME[tier] || 'Plan'
  const isCurrent = plan.id === (entitlement.subscription?.planId || null)
  const upgrading = Boolean(entitlement.subscription?.planId)

  return (
    <div className="card plan featured">
      <span className="plan-flag">unlocks this</span>

      <div className="row between">
        <h3 style={{ fontSize: 20 }}>{name}</h3>
        {isCurrent && <span className="chip brand">current</span>}
      </div>

      <div className="plan-price">
        {money(plan.price, plan.currency)}
        <span className="small muted"> /month</span>
      </div>

      <p className="small muted" style={{ minHeight: 38, marginTop: 8 }}>{plan.blurb}</p>

      <ul className="plan-features">
        {(plan.features || []).map((f) => (
          <li key={f}><span className="tickmark">✓</span>{f}</li>
        ))}
      </ul>

      {error && (
        <div className="small mt-4" style={{ color: 'var(--hot)' }}>{error}</div>
      )}

      <button
        className="btn primary"
        style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        disabled={isCurrent || busy || !billingEnabled}
        onClick={buy}
      >
        {!billingEnabled
          ? 'Checkout coming soon'
          : isCurrent
            ? 'Your current plan'
            : busy
              ? 'Opening checkout…'
              : upgrading
                ? `Upgrade to ${name} — ${money(plan.price, plan.currency)}/mo`
                : `Get ${name} — ${money(plan.price, plan.currency)}/mo`}
      </button>

      <div className="small muted" style={{ marginTop: 10, lineHeight: 1.45 }}>
        Charged today, starts today. Cancel anytime — cancelling drops you to the free tier,
        not out of the app. Razorpay handles the card; we never see it.
      </div>
    </div>
  )
}

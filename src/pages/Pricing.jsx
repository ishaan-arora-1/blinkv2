import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans, subscribeToPlan, CheckoutDismissed } from '../lib/razorpay.js'
import { go } from '../lib/router.js'

export default function Pricing() {
  const { entitlement, user, refreshAccount, signOut } = useAuth()
  const [plans, setPlans] = useState([])
  const [billingEnabled, setBillingEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState(null)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((r) => {
        if (!alive) return
        setPlans(r.plans || [])
        // The server tells us whether Razorpay is wired up yet.
        setBillingEnabled(r.billingEnabled !== false)
      })
      .catch((err) => alive && setLoadError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const currentPlanId = entitlement.subscription?.planId || null

  async function subscribe(plan) {
    setBusyPlan(plan.id)
    setError(null)
    try {
      await subscribeToPlan(plan.id, { user })
      await refreshAccount()
      go('/dashboard')
    } catch (err) {
      if (!(err instanceof CheckoutDismissed)) setError(err.message)
    } finally {
      setBusyPlan(null)
    }
  }

  const lapsed = entitlement.tier === 'none'

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Plans</div>
        <h1 className="page-title">
          {lapsed ? <>Pick a plan to <em>keep going</em></> : <>Your <em>plan</em></>}
        </h1>
        <p className="page-sub">
          {entitlement.onTrial ? (
            <>
              You're on the free trial — {entitlement.trialDaysLeft}{' '}
              {entitlement.trialDaysLeft === 1 ? 'day' : 'days'} left, with everything unlocked.
              Pick a plan whenever you're ready.
            </>
          ) : lapsed ? (
            <>Your access has ended. Everything you made is safe and comes straight back.</>
          ) : (
            <>Change or cancel any time. Billing is monthly, in rupees.</>
          )}
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginBottom: 20, maxWidth: 760 }}>
          <div className="row"><span className="chip hot">payment</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      {!loading && !loadError && !billingEnabled && (
        <div className="card" style={{ borderColor: 'rgba(111,240,184,0.35)', marginBottom: 20, maxWidth: 760 }}>
          <div className="row"><span className="chip sea">coming soon</span></div>
          <div className="small mt-2">
            Checkout isn't switched on yet. These are the plans we'll launch with — for now
            everything is unlocked on your trial.
          </div>
        </div>
      )}

      {loadError ? (
        <div className="empty">
          <div className="big">✧</div>
          <b>Couldn't load the plans.</b>
          <div className="small mt-2">{loadError}</div>
        </div>
      ) : loading ? (
        <div className="empty"><span className="tick">Loading plans…</span></div>
      ) : (
        <div className="grid cols-2" style={{ maxWidth: 860, alignItems: 'start' }}>
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId
            const isUpgrade = currentPlanId && plan.rank > (plans.find((p) => p.id === currentPlanId)?.rank ?? 0)
            return (
              <div key={plan.id} className={`card plan ${plan.tier === 'studio' ? 'featured' : ''}`}>
                {plan.tier === 'studio' && <span className="plan-flag">Includes Blink AI</span>}
                <div className="row between">
                  <h3 style={{ fontSize: 20 }}>{plan.name}</h3>
                  {isCurrent && <span className="chip mint">current</span>}
                </div>
                <div className="plan-price">
                  ₹{plan.price.toLocaleString('en-IN')}
                  <span className="small muted"> /month</span>
                </div>
                <p className="small muted" style={{ minHeight: 38 }}>{plan.blurb}</p>

                <ul className="plan-features">
                  {plan.features.map((f) => (
                    <li key={f}><span className="tickmark">✓</span>{f}</li>
                  ))}
                </ul>

                <button
                  className={`btn ${plan.tier === 'studio' ? 'primary' : ''}`}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  disabled={isCurrent || busyPlan !== null || !billingEnabled}
                  onClick={() => subscribe(plan)}
                >
                  {!billingEnabled
                    ? 'Checkout coming soon'
                    : isCurrent
                    ? 'Your current plan'
                    : busyPlan === plan.id
                      ? 'Opening checkout…'
                      : isUpgrade
                        ? `Upgrade to ${plan.name}`
                        : currentPlanId
                          ? `Switch to ${plan.name}`
                          : `Choose ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="small muted mt-6" style={{ maxWidth: 760 }}>
        Payments are handled by Razorpay — reelmint never sees your card. Switching plans cancels the
        previous subscription once the new one is active.
        {lapsed && (
          <>
            {' '}Not ready?{' '}
            <button className="btn ghost xs" onClick={signOut}>Sign out</button>
          </>
        )}
      </div>
    </div>
  )
}

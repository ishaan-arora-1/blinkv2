import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { fetchPlans, subscribeToPlan, CheckoutDismissed } from '../lib/razorpay.js'
import { money, perMonth } from '../lib/money.js'
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

  // Monthly first, and only offer the toggle if there is actually something to
  // toggle between — a single-period plan list should not grow a dead control.
  const periods = [...new Set(plans.map((p) => p.period))].sort((a, b) =>
    a === 'monthly' ? -1 : b === 'monthly' ? 1 : 0
  )
  const [period, setPeriod] = useState('monthly')

  // Land people on the period they are already paying for, so their current
  // plan is the one showing when the page opens.
  useEffect(() => {
    const current = plans.find((p) => p.id === currentPlanId)
    if (current) setPeriod(current.period)
    else if (periods.length && !periods.includes(period)) setPeriod(periods[0])
  }, [currentPlanId, plans.length])

  const shownPlans = plans.filter((p) => p.period === period)

  const bestSaving = Math.max(
    0,
    ...plans
      .filter((p) => p.period === 'yearly')
      .map((p) => {
        const monthly = plans.find((m) => m.tier === p.tier && m.period === 'monthly')
        return monthly ? Math.round((1 - p.price / (monthly.price * 12)) * 100) : 0
      })
  )

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
              {entitlement.trialDaysLeft === 1 ? 'day' : 'days'} left, with unlimited carousels and
              hook videos. Blink AI needs Growth. Choosing a plan charges you today and starts your
              billing month from today.
            </>
          ) : lapsed ? (
            <>Your access has ended. Everything you made is safe and comes straight back.</>
          ) : (
            <>Change or cancel any time.</>
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
        <div className="card" style={{ borderColor: 'rgba(243, 164, 230,0.35)', marginBottom: 20, maxWidth: 760 }}>
          <div className="row"><span className="chip accent">coming soon</span></div>
          <div className="small mt-2">
            Checkout isn't switched on yet. These are the plans we'll launch with — for now
            your trial covers carousels and hook videos.
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
        <>
          {periods.length > 1 && (
            <div className="row" style={{ marginBottom: 22 }}>
              <div className="seg">
                {periods.map((p) => (
                  <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
                    {p === 'yearly' ? 'Yearly' : 'Monthly'}
                    {p === 'yearly' && bestSaving > 0 && (
                      <span className="save-pill">save {bestSaving}%</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

        <div className="grid cols-2" style={{ maxWidth: 860, alignItems: 'start' }}>
          {shownPlans.map((plan) => {
            const isCurrent = plan.id === currentPlanId
            const isUpgrade = currentPlanId && plan.rank > (plans.find((p) => p.id === currentPlanId)?.rank ?? 0)
            // Compare against the same tier billed monthly, which is the number
            // a yearly price only means anything next to.
            const monthlyTwin = plans.find((p) => p.tier === plan.tier && p.period === 'monthly')
            const saving =
              plan.period === 'yearly' && monthlyTwin
                ? Math.round((1 - plan.price / (monthlyTwin.price * 12)) * 100)
                : 0

            return (
              <div key={plan.id} className={`card plan ${plan.tier === 'growth' ? 'featured' : ''}`}>
                {plan.tier === 'growth' && <span className="plan-flag">Includes Blink AI</span>}
                <div className="row between">
                  <h3 style={{ fontSize: 20 }}>{plan.name}</h3>
                  {isCurrent && <span className="chip brand">current</span>}
                </div>
                <div className="plan-price">
                  {money(plan.price, plan.currency)}
                  <span className="small muted"> /{plan.period === 'yearly' ? 'year' : 'month'}</span>
                </div>
                {plan.period === 'yearly' && monthlyTwin && (
                  <div className="small muted" style={{ marginTop: -2 }}>
                    {perMonth(plan.price, plan.currency)}/month, billed yearly
                    {saving > 0 && <> — <b style={{ color: 'var(--brand)' }}>save {saving}%</b></>}
                  </div>
                )}
                <p className="small muted" style={{ minHeight: 38, marginTop: 8 }}>{plan.blurb}</p>

                <ul className="plan-features">
                  {plan.features.map((f) => (
                    <li key={f}><span className="tickmark">✓</span>{f}</li>
                  ))}
                </ul>

                <button
                  className={`btn ${plan.tier === 'growth' ? 'primary' : ''}`}
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
        </>
      )}

      <div className="small muted mt-6" style={{ maxWidth: 760 }}>
        Payments are handled by Razorpay — Blink UGC never sees your card. Switching plans cancels the
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

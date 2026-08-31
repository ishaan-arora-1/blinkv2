import React, { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { cancelSubscription, fetchPayments } from '../lib/razorpay.js'
import { money } from '../lib/money.js'
import { go } from '../lib/router.js'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Account() {
  const { user, entitlement, refreshAccount, signOut } = useAuth()
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchPayments()
      .then((r) => alive && setPayments(r.payments || []))
      .catch(() => {})
      .finally(() => alive && setLoadingPayments(false))
    return () => {
      alive = false
    }
  }, [])

  const sub = entitlement.subscription

  async function doCancel() {
    setCancelling(true)
    setError(null)
    try {
      await cancelSubscription()
      await refreshAccount()
      setConfirming(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Account</div>
        <h1 className="page-title">Your <em>account</em></h1>
        <p className="page-sub">Plan, billing and sign-in.</p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginBottom: 18, maxWidth: 640 }}>
          <div className="row"><span className="chip hot">error</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      <div className="grid cols-2" style={{ maxWidth: 860, alignItems: 'start' }}>
        {/* ── identity ── */}
        <div className="card">
          <h4>Signed in</h4>
          <div className="row mt-4" style={{ gap: 12 }}>
            {user?.avatarUrl && (
              <img
                src={user.avatarUrl} alt=""
                referrerPolicy="no-referrer"
                style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid var(--line)' }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{user?.fullName || 'Blink UGC user'}</div>
              <div className="small muted">{user?.email}</div>
            </div>
          </div>
          <div className="row mt-4">
            <button className="btn sm" onClick={signOut}>Sign out</button>
          </div>
        </div>

        {/* ── plan ── */}
        <div className="card">
          <div className="row between">
            <h4>Plan</h4>
            {!sub && <span className="chip">free</span>}
          </div>

          {sub && (
            <div className="mt-4">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{sub.planName}</span>
                {sub.period && <span className="chip">{sub.period === 'yearly' ? 'yearly' : 'monthly'}</span>}
              </div>
              <div className="small muted mt-2">
                {sub.cancelAtCycleEnd ? (
                  <>Cancelled — access continues until {fmtDate(sub.currentEnd)}.</>
                ) : sub.status === 'authenticated' ? (
                  // The mandate is approved and the first payment is settling.
                  // Subscriptions created before billing moved to charge-on-
                  // signup can still sit here with a future charge date, so the
                  // date is only quoted when there really is one ahead.
                  new Date(sub.chargeAt || 0) > new Date() ? (
                    <>Card authorised. First charge {fmtDate(sub.chargeAt)}.</>
                  ) : (
                    <>Card authorised — confirming your first payment.</>
                  )
                ) : (
                  <>Renews {fmtDate(sub.currentEnd)}.</>
                )}
              </div>

              {entitlement.paymentRetrying && (
                <div className="small mt-4" style={{ color: 'var(--hot)' }}>
                  A payment didn't go through and Razorpay is retrying. Your access continues for now —
                  check the card on file to avoid losing it.
                </div>
              )}

              <div className="row mt-4 wrap">
                <button className="btn sm" onClick={() => go('/pricing')}>Change plan</button>
                {!sub.cancelAtCycleEnd && (
                  <button className="btn sm danger" onClick={() => setConfirming(true)}>Cancel</button>
                )}
              </div>
            </div>
          )}

          {!sub && (
            <div className="mt-4">
              <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Free</div>
              <div className="small muted mt-2">
                Unlimited photo carousels over the built-in photography, with no card on file and no
                end date. Creator adds hook videos, animated carousels and your own image sets.
              </div>
              <button className="btn primary sm mt-4" onClick={() => go('/pricing')}>See plans →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── payments ── */}
      <div className="card mt-6" style={{ maxWidth: 860 }}>
        <h4>Payment history</h4>
        {loadingPayments ? (
          <div className="small muted mt-4">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="small muted mt-4">No payments yet.</div>
        ) : (
          <div className="table-scroll mt-4">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td>{money(p.amount, p.currency)}</td>
                    <td>{p.method || '—'}</td>
                    <td>
                      <span className={`chip ${p.status === 'captured' ? 'mint' : p.status === 'failed' ? 'hot' : ''}`}>
                        {p.status || 'unknown'}
                      </span>
                    </td>
                    <td className="mono small muted">{p.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirming && (
        <div className="modal-veil" onClick={() => setConfirming(false)}>
          <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>Cancel your plan?</h3>
            <div className="sub">
              You keep full access until {fmtDate(sub?.currentEnd)}, then drop to the free tier —
              photo carousels stay, and nothing you've made is deleted. You can resubscribe any time.
            </div>
            <div className="row mt-4" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirming(false)}>Keep my plan</button>
              <button className="btn danger" disabled={cancelling} onClick={doCancel}>
                {cancelling ? 'Cancelling…' : 'Cancel plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

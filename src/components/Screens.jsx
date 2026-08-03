import React from 'react'

/** Full-page states that sit outside the app shell: loading, misconfig, failure. */

export function Splash({ label = 'Loading your studio…' }) {
  return (
    <div className="hero" style={{ justifyContent: 'center', gap: 14 }}>
      <div className="tick" style={{ fontSize: 34, zIndex: 1 }}>✦</div>
      <div className="small muted" style={{ zIndex: 1 }}>{label}</div>
    </div>
  )
}

export function ErrorScreen({ title = 'Something went wrong', message, onRetry, onSignOut }) {
  return (
    <div className="hero" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(560px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
        <div className="row"><span className="chip hot">error</span></div>
        <h2 style={{ margin: '12px 0 8px' }}>{title}</h2>
        <p className="small muted">{message}</p>
        <div className="row mt-4">
          {onRetry && <button className="btn primary sm" onClick={onRetry}>Try again</button>}
          {onSignOut && <button className="btn ghost sm" onClick={onSignOut}>Sign out</button>}
        </div>
      </div>
    </div>
  )
}

/**
 * Shown when the build is missing the env vars it needs. Without this the app
 * renders a blank page and the cause is invisible.
 */
export function SetupNeeded({ missing }) {
  return (
    <div className="hero" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(640px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
        <div className="row"><span className="chip hot">setup</span></div>
        <h2 style={{ margin: '12px 0 8px' }}>Blink UGC isn't configured yet</h2>
        <p className="small muted">
          These environment variables are missing from this build. Add them to{' '}
          <span className="mono">.env</span> and restart the dev server (or set them in your
          host's dashboard and redeploy).
        </p>
        <div className="grid mt-4" style={{ gap: 6 }}>
          {missing.map((m) => (
            <div key={m.name} className="row between" style={{ gap: 12 }}>
              <span className="mono small" style={{ color: 'var(--brand)' }}>{m.name}</span>
              <span className="small muted" style={{ textAlign: 'right' }}>{m.hint}</span>
            </div>
          ))}
        </div>
        <div className="small muted mt-4" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          Full walkthrough in <span className="mono">DEPLOY.md</span>.
        </div>
      </div>
    </div>
  )
}

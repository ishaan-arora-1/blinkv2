import React from 'react'
import { useHashRoute, go } from './lib/router.js'
import { useAuth } from './lib/auth.jsx'
import { useStore } from './lib/store.jsx'
import { isApiConfigured } from './lib/api.js'
import { isConfigured as isSupabaseConfigured } from './lib/supabase.js'
import { planFor } from './lib/tiers.js'

import Dashboard from './pages/Dashboard.jsx'
import Brand from './pages/Brand.jsx'
import Sets from './pages/Sets.jsx'
import Carousels from './pages/Carousels.jsx'
import CarouselEditor from './pages/CarouselEditor.jsx'
import Videos from './pages/Videos.jsx'
import VideoEditor from './pages/VideoEditor.jsx'
import BlinkAI from './pages/BlinkAI.jsx'
import Library from './pages/Library.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Login from './pages/Login.jsx'
import Pricing from './pages/Pricing.jsx'
import Account from './pages/Account.jsx'
import { Splash, ErrorScreen, SetupNeeded } from './components/Screens.jsx'

export { go }

const NAV = [
  { path: '/dashboard', label: 'Studio', ico: '◍', section: null },
  { path: '/carousels', label: 'Carousels', ico: '❏', section: 'Create' },
  { path: '/videos', label: 'Videos', ico: '▶', section: null },
  { path: '/blink', label: 'Blink AI', ico: '✦', section: null, feature: 'blink' },
  { path: '/library', label: 'Library', ico: '▤', section: null },
  { path: '/sets', label: 'Image Sets', ico: '❖', section: 'Setup' },
  { path: '/brand', label: 'Brand', ico: '✧', section: null },
  { path: '/account', label: 'Account', ico: '◎', section: null },
]

// Reachable without an active plan, so a lapsed user can always get back in.
const BILLING_ROUTES = ['/pricing', '/account']

function missingConfig() {
  const missing = []
  if (!isSupabaseConfigured) {
    missing.push(
      { name: 'VITE_SUPABASE_URL', hint: 'Supabase → Project Settings → API' },
      { name: 'VITE_SUPABASE_ANON_KEY', hint: 'Supabase → Project Settings → API' }
    )
  }
  if (!isApiConfigured) {
    missing.push({ name: 'VITE_API_URL', hint: 'Your Railway API URL, e.g. https://blink-ugc-api.up.railway.app' })
  }
  return missing
}

export default function App() {
  const route = useHashRoute()
  const auth = useAuth()

  // ── config ──
  const missing = missingConfig()
  if (missing.length) return <SetupNeeded missing={missing} />

  // ── session ──
  if (auth.authStatus === 'loading') return <Splash label="Checking your session…" />
  if (auth.authStatus !== 'authenticated') return <Login />

  // ── account + entitlement ──
  if (auth.accountStatus === 'loading' || auth.accountStatus === 'idle') {
    return <Splash label="Loading your account…" />
  }
  if (auth.accountStatus === 'error') {
    return (
      <ErrorScreen
        title="We couldn't load your account"
        message={
          auth.accountError?.code === 'network'
            ? 'The Blink UGC API is unreachable. If you just deployed, give it a moment and try again.'
            : auth.accountError?.message
        }
        onRetry={auth.refreshAccount}
        onSignOut={auth.signOut}
      />
    )
  }

  // ── paywall ──
  // The client hiding a feature is a courtesy; the API is what enforces it.
  if (auth.entitlement.tier === 'none' && !BILLING_ROUTES.includes(route)) {
    return (
      <Shell route="/pricing" auth={auth} minimal>
        <Pricing />
      </Shell>
    )
  }

  return (
    <Shell route={route} auth={auth}>
      <Routed route={route} auth={auth} />
    </Shell>
  )
}

/** Everything past the paywall needs the store loaded. */
function Routed({ route, auth }) {
  const store = useStore()

  if (BILLING_ROUTES.includes(route)) {
    return route === '/account' ? <Account /> : <Pricing />
  }

  if (store.status === 'loading' || store.status === 'idle') return <Splash />
  if (store.status === 'error') {
    return (
      <ErrorScreen
        title="We couldn't load your work"
        message={store.error?.message}
        onRetry={store.reload}
        onSignOut={auth.signOut}
      />
    )
  }

  if (!store.state.brand.onboarded) return <Onboarding />

  if (route.startsWith('/carousel/')) return <CarouselEditor id={route.split('/')[2]} />
  if (route.startsWith('/video/')) return <VideoEditor id={route.split('/')[2]} />
  if (route === '/carousels') return <Carousels />
  if (route === '/videos') return <Videos />
  if (route === '/blink') return <BlinkAI />
  if (route === '/library') return <Library />
  if (route === '/sets') return <Sets />
  if (route === '/brand') return <Brand />
  return <Dashboard />
}

function Shell({ route, auth, children, minimal = false }) {
  const store = useStore()
  const isEditor = route.startsWith('/carousel/') || route.startsWith('/video/')
  const brand = store.state.brand
  const { entitlement } = auth

  // Onboarding and the lapsed-plan paywall are both full-bleed: no sidebar to
  // navigate away into features that are not available yet.
  const bare = minimal || (store.status === 'ready' && !brand.onboarded)

  if (bare) {
    return (
      <div className="shell">
        <main className="main">{children}</main>
      </div>
    )
  }

  return (
    <div className="shell">
      {!isEditor && (
        <aside className="sidebar">
          <a className="logo" href="#/dashboard">Blink UGC<span className="dot">●</span></a>
          <div className="logo-sub">social studio for iOS apps</div>

          {NAV.map((n) => {
            const locked = n.feature && !auth.can[n.feature]
            return (
              <React.Fragment key={n.path}>
                {n.section && <div className="nav-section">{n.section}</div>}
                <a
                  className={`nav-item ${route === n.path ? 'active' : ''} ${locked ? 'locked' : ''}`}
                  href={`#${n.path}`}
                  title={locked ? `Available on the ${planFor(n.feature)} plan` : undefined}
                >
                  <span className="ico">{n.ico}</span>
                  {n.label}
                  {locked && <span className="lock">{planFor(n.feature)}</span>}
                </a>
              </React.Fragment>
            )
          })}

          <div className="spacer" />

          <PlanBadge entitlement={entitlement} />

          <div className="small muted" style={{ padding: '0 12px' }}>
            {brand.appName ? (
              <>Marketing <b style={{ color: 'var(--mint)' }}>{brand.appName}</b></>
            ) : (
              'No brand set'
            )}
          </div>
        </aside>
      )}

      <main className="main" style={isEditor ? { padding: '22px 28px 60px' } : undefined}>
        <LegacyOffer store={store} />
        <ImportNotice store={store} />
        {children}
      </main>
    </div>
  )
}

function PlanBadge({ entitlement }) {
  if (entitlement.onTrial && !entitlement.subscription) {
    const d = entitlement.trialDaysLeft
    return (
      <a className="plan-badge trial" href="#/pricing">
        <b>{d} {d === 1 ? 'day' : 'days'} left</b>
        <span>on your free trial — see plans</span>
      </a>
    )
  }
  if (entitlement.paymentRetrying) {
    return (
      <a className="plan-badge warn" href="#/account">
        <b>Payment problem</b>
        <span>we're retrying — check your card</span>
      </a>
    )
  }
  if (entitlement.subscription?.cancelAtCycleEnd) {
    return (
      <a className="plan-badge warn" href="#/account">
        <b>Plan ending</b>
        <span>resubscribe to keep access</span>
      </a>
    )
  }
  return null
}

/**
 * Offers to bring across work saved in this browser before accounts existed.
 *
 * Deliberately a question, not an action. Importing automatically meant a new
 * account could open onto someone else's carousels, which is alarming and looks
 * like a data leak even when it isn't.
 */
function LegacyOffer({ store }) {
  const found = store.legacyFound
  if (!found) return null

  const bits = [
    found.carousels && `${found.carousels} carousel${found.carousels === 1 ? '' : 's'}`,
    found.videos && `${found.videos} video${found.videos === 1 ? '' : 's'}`,
    found.sets && `${found.sets} image set${found.sets === 1 ? '' : 's'}`,
  ].filter(Boolean)

  if (!bits.length) return null

  return (
    <div className="card" style={{ borderColor: 'rgba(111,240,184,0.35)', marginBottom: 20 }}>
      <div className="row"><span className="chip sea">found on this device</span></div>
      <div className="small mt-2">
        This browser still has {bits.join(', ')} from before Blink UGC had accounts
        {found.appName ? <> (for <b>{found.appName}</b>)</> : null}. Move it into your account?
      </div>
      <div className="row mt-4">
        <button className="btn primary sm" disabled={store.importing} onClick={store.importLegacy}>
          {store.importing ? 'Importing…' : 'Import it'}
        </button>
        <button className="btn ghost sm" disabled={store.importing} onClick={store.dismissLegacy}>
          No thanks
        </button>
      </div>
      <div className="small muted mt-2">
        Nothing is deleted from this browser either way. Only offered once.
      </div>
    </div>
  )
}

/** Shown once, after work from the local-only era is lifted into the account. */
function ImportNotice({ store }) {
  const n = store.importNotice
  if (!n) return null

  const bits = [
    n.carousels && `${n.carousels} carousel${n.carousels === 1 ? '' : 's'}`,
    n.videos && `${n.videos} video${n.videos === 1 ? '' : 's'}`,
    n.sets && `${n.sets} image set${n.sets === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <div className="card" style={{ borderColor: 'rgba(214,246,92,0.4)', marginBottom: 20 }}>
      <div className="row between">
        <div className="row"><span className="chip mint">imported</span></div>
        <button className="btn ghost xs" onClick={store.dismissImportNotice}>Dismiss</button>
      </div>
      <div className="small mt-2">
        Moved {bits.join(', ')} from this browser into your account — it now syncs everywhere you sign in.
        {n.skippedBlinks > 0 && (
          <> {n.skippedBlinks} older Blink AI clip{n.skippedBlinks === 1 ? '' : 's'} stayed local and
          weren't imported.</>
        )}
      </div>
    </div>
  )
}

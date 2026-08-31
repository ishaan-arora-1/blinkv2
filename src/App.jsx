import React from 'react'
import { useHashRoute, go } from './lib/router.js'
import { useAuth } from './lib/auth.jsx'
import { useStore } from './lib/store.jsx'
import { isApiConfigured } from './lib/api.js'
import { isConfigured as isSupabaseConfigured } from './lib/supabase.js'
import { planFor, isPaying } from './lib/tiers.js'

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
import Landing from './pages/Landing.jsx'
import Pricing from './pages/Pricing.jsx'
import Account from './pages/Account.jsx'
import { Splash, ErrorScreen, SetupNeeded } from './components/Screens.jsx'
import Logo from './components/Logo.jsx'

export { go }

// `feature` marks a nav item that needs a plan. Carousels has none: photo
// carousels are free, and the wizard is where the animated half gets locked.
// Image Sets is listed without one too — the page is worth seeing on the free
// tier, since the built-in collections it shows are what free carousels are
// built from. It locks the uploading, not the looking.
const NAV = [
  { path: '/dashboard', label: 'Studio', ico: '◍', section: null },
  // Blink AI leads Create because it is the thing that makes a whole video.
  // The name used to belong to a single eight-second Veo clip; that page is
  // gone and this is what the product means by it now — one idea, several
  // scenes, narrated and cut together. The feature key stays 'multiframe',
  // which is what the server gates and meters on.
  { path: '/blink', label: 'Blink AI', ico: '✦', section: 'Create', feature: 'multiframe' },
  { path: '/carousels', label: 'Carousels', ico: '❏', section: null },
  { path: '/videos', label: 'Videos', ico: '▶', section: null, feature: 'videos' },
  { path: '/library', label: 'Library', ico: '▤', section: null },
  { path: '/sets', label: 'Image Sets', ico: '❖', section: 'Setup' },
  { path: '/brand', label: 'Brand', ico: '✧', section: null },
  { path: '/account', label: 'Account', ico: '◎', section: null },
]

// Rendered before the store has loaded, so billing is always reachable.
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
  if (auth.authStatus !== 'authenticated') return <Landing />

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

  // There is no paywall in front of the studio any more. Every signed-in
  // account is on at least the free tier, which is photo carousels, so the door
  // is always open and the locks live on the individual features instead. The
  // client hiding one is a courtesy; the API is what enforces it.
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
  // A reel has its own URL so it can be left and come back to while it renders.
  if (route.startsWith('/blink/')) return <BlinkAI reelId={route.split('/')[2]} />
  if (route === '/blink') return <BlinkAI />
  // Where the feature used to live, kept so an open tab or a bookmark still
  // lands somewhere real.
  if (route === '/multiframe') return <BlinkAI />
  if (route === '/library') return <Library />
  if (route === '/sets') return <Sets />
  if (route === '/brand') return <Brand />
  return <Dashboard />
}

function Shell({ route, auth, children }) {
  const store = useStore()
  const isEditor = route.startsWith('/carousel/') || route.startsWith('/video/')
  const brand = store.state.brand
  const { entitlement } = auth

  // Below 900px the sidebar is a drawer. It is closed on every route change
  // rather than by each link, so tapping any nav item both navigates and
  // dismisses — including the ones that route to the same page.
  const [navOpen, setNavOpen] = React.useState(false)
  React.useEffect(() => setNavOpen(false), [route])

  React.useEffect(() => {
    if (!navOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    // Stop the page behind the drawer from scrolling with it.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [navOpen])

  // Onboarding is full-bleed: no sidebar to navigate away into features that
  // have nothing to work with until a brand exists.
  const bare = store.status === 'ready' && !brand.onboarded

  if (bare) {
    return (
      <div className="shell">
        <main className="main">{children}</main>
      </div>
    )
  }

  return (
    <div className="shell">
      {/* Only rendered when there is a sidebar to open. The editors hide the
          sidebar and carry their own Back button, so a bar here would be a
          second, redundant way out. */}
      {!isEditor && (
        <header className="topbar">
          <button
            className="topbar-burger"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
          >
            ☰
          </button>
          <a href="#/dashboard" style={{ textDecoration: 'none' }}><Logo size={22} /></a>
        </header>
      )}

      {!isEditor && navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

      {!isEditor && (
        <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
          <a href="#/dashboard" style={{ textDecoration: 'none' }}><Logo size={26} /></a>
          <div className="logo-sub">ugc studio for your product</div>

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

          <BrandSwitcher store={store} brand={brand} />
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

/**
 * Which brand the app is currently working on.
 *
 * A plain select rather than a menu: with one brand it reads as a label and
 * costs nothing, and the moment there are several it is already the control.
 * Everything that generates copy — both carousel kinds, videos — reads the
 * active brand, so this is the single thing that decides whose voice the app
 * is writing in.
 */
function BrandSwitcher({ store, brand }) {
  const brands = store.state.brands || []

  if (brands.length <= 1) {
    return (
      <div className="small muted" style={{ padding: '0 12px' }}>
        {brand.appName ? (
          <>Marketing <b style={{ color: 'var(--brand)' }}>{brand.appName}</b></>
        ) : (
          'No brand set'
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '0 12px' }}>
      <div className="small muted" style={{ marginBottom: 6 }}>Marketing</div>
      <select
        className="input"
        style={{ padding: '7px 9px', fontSize: 13 }}
        value={brand.id || ''}
        onChange={(e) => store.setActiveBrand(e.target.value)}
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.appName || 'Untitled brand'}
          </option>
        ))}
      </select>
    </div>
  )
}

function PlanBadge({ entitlement }) {
  // Payment trouble outranks the upsell: someone whose card is failing is
  // already a customer, and selling to them instead of telling them is how you
  // lose one.
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
        <span>you keep photo carousels either way</span>
      </a>
    )
  }
  if (!isPaying(entitlement)) {
    return (
      <a className="plan-badge trial" href="#/pricing">
        <b>Free plan</b>
        <span>photo carousels — see what's on Starter</span>
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
    <div className="card" style={{ borderColor: 'rgba(243, 164, 230,0.35)', marginBottom: 20 }}>
      <div className="row"><span className="chip accent">found on this device</span></div>
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
    <div className="card" style={{ borderColor: 'rgba(168, 120, 255,0.4)', marginBottom: 20 }}>
      <div className="row between">
        <div className="row"><span className="chip brand">imported</span></div>
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

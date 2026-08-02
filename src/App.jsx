import React, { useEffect, useState } from 'react'
import { useStore } from './lib/store.jsx'
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

// hash router: #/dashboard, #/carousels, #/carousel/:id, #/videos, #/video/:id, #/blink, #/library, #/sets, #/brand
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/dashboard')
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/dashboard')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash.replace(/^#/, '')
}

export function go(path) {
  window.location.hash = path
}

const NAV = [
  { path: '/dashboard', label: 'Studio', ico: '◍', section: null },
  { path: '/carousels', label: 'Carousels', ico: '❏', section: 'Create' },
  { path: '/videos', label: 'Videos', ico: '▶', section: null },
  { path: '/blink', label: 'Blink AI', ico: '✦', section: null },
  { path: '/library', label: 'Library', ico: '▤', section: null },
  { path: '/sets', label: 'Image Sets', ico: '❖', section: 'Setup' },
  { path: '/brand', label: 'Brand', ico: '✧', section: null },
]

export default function App() {
  const store = useStore()
  const route = useHashRoute()

  if (!store.state.brand.onboarded) return <Onboarding />

  let page
  if (route.startsWith('/carousel/')) page = <CarouselEditor id={route.split('/')[2]} />
  else if (route.startsWith('/video/')) page = <VideoEditor id={route.split('/')[2]} />
  else if (route === '/carousels') page = <Carousels />
  else if (route === '/videos') page = <Videos />
  else if (route === '/blink') page = <BlinkAI />
  else if (route === '/library') page = <Library />
  else if (route === '/sets') page = <Sets />
  else if (route === '/brand') page = <Brand />
  else page = <Dashboard />

  const isEditor = route.startsWith('/carousel/') || route.startsWith('/video/')

  return (
    <div className="shell">
      {!isEditor && (
        <aside className="sidebar">
          <a className="logo" href="#/dashboard">reelmint<span className="dot">●</span></a>
          <div className="logo-sub">social studio for iOS apps</div>
          {NAV.map((n) => (
            <React.Fragment key={n.path}>
              {n.section && <div className="nav-section">{n.section}</div>}
              <a className={`nav-item ${route === n.path ? 'active' : ''}`} href={`#${n.path}`}>
                <span className="ico">{n.ico}</span>
                {n.label}
              </a>
            </React.Fragment>
          ))}
          <div className="spacer" />
          <div className="small muted" style={{ padding: '0 12px' }}>
            {store.state.brand.appName ? <>Marketing <b style={{ color: 'var(--mint)' }}>{store.state.brand.appName}</b></> : 'No brand set'}
          </div>
        </aside>
      )}
      <main className="main" style={isEditor ? { padding: '22px 28px 60px' } : undefined}>
        {page}
      </main>
    </div>
  )
}

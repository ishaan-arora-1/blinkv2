import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth.jsx'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import './styles.css'

/**
 * Without this, a render error anywhere unmounts the whole tree and leaves a
 * white page with the cause only in the console — which nobody has open.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[blink-ugc] render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="hero" style={{ justifyContent: 'center' }}>
        <div className="card" style={{ width: 'min(560px, 94vw)', textAlign: 'left', zIndex: 1, padding: 28 }}>
          <div className="row"><span className="chip hot">crashed</span></div>
          <h2 style={{ margin: '12px 0 8px' }}>Something broke</h2>
          <p className="small muted">
            Your work is saved in your account — reloading is safe.
          </p>
          <pre className="mono small" style={{ marginTop: 14, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="row mt-4">
            <button className="btn primary sm" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    {/* StoreProvider reads the session from AuthProvider, so it nests inside. */}
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </ErrorBoundary>
)

import { useEffect, useState } from 'react'

// A hash router, kept deliberately small. Hash routing means the app can be
// served as static files from anywhere without rewrite rules, which matters
// because the OAuth redirect lands on the app root.
//
// This lives outside App.jsx so pages can navigate without importing App and
// creating an import cycle.

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/dashboard')

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

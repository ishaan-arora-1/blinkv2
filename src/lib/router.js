import { useEffect, useState } from 'react'

// A hash router, kept deliberately small. Hash routing means the app can be
// served as static files from anywhere without rewrite rules, which matters
// because the OAuth redirect lands on the app root.
//
// This lives outside App.jsx so pages can navigate without importing App and
// creating an import cycle.

/**
 * The two routes that are also real paths.
 *
 * Everything else in the app lives behind the hash, which is fine for a studio
 * you reach by signing in. It is not fine for the pages links point *at*:
 * `blinkugc.com/#/go` is not a URL you can put in an ad, and Meta's editor,
 * link shorteners and half of the apps that render a preview will mangle a
 * fragment or drop it. Vercel rewrites these two paths to index.html; this is
 * the half that turns the path back into a route.
 *
 * OAuth is unaffected: signInWithGoogle always returns to the origin root, so
 * the callback never lands on one of these.
 */
const PATH_ROUTES = ['/go', '/ad']

function readRoute() {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash) return hash

  // A trailing slash is the same page, and /go/ is what people type.
  const path = window.location.pathname.replace(/\/+$/, '')
  return PATH_ROUTES.includes(path) ? path : '/dashboard'
}

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const fn = () => setRoute(readRoute())
    window.addEventListener('hashchange', fn)
    // A path route changes by navigation rather than by fragment, so popstate
    // is what catches the back button off one of them.
    window.addEventListener('popstate', fn)
    return () => {
      window.removeEventListener('hashchange', fn)
      window.removeEventListener('popstate', fn)
    }
  }, [])

  return route
}

export function go(path) {
  window.location.hash = path
}

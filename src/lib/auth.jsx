import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured } from './supabase.js'
import { api } from './api.js'

const AuthCtx = createContext(null)

// Only ever rendered before /api/me answers. Deliberately the most locked-down
// shape there is rather than the free tier's: this is "we do not know yet", and
// flashing a feature on before the server has confirmed it is worse than the
// half-second of it being off.
const EMPTY_ENTITLEMENT = {
  tier: 'free',
  paidTier: 'free',
  features: { carousels: false, videos: false, animated: false, sets: false, blink: false },
  paymentRetrying: false,
  subscription: null,
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // 'loading' until Supabase has told us whether a stored session exists —
  // rendering the login screen before that flashes it at signed-in users on
  // every refresh.
  const [authStatus, setAuthStatus] = useState('loading')

  const [account, setAccount] = useState(null)
  const [accountStatus, setAccountStatus] = useState('idle')
  const [accountError, setAccountError] = useState(null)

  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    if (!isConfigured) {
      setAuthStatus('unconfigured')
      return
    }

    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
      setAuthStatus(data.session ? 'authenticated' : 'anonymous')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
      setAuthStatus(next ? 'authenticated' : 'anonymous')
      if (!next) {
        setAccount(null)
        setAccountStatus('idle')
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null
  const loadedFor = useRef(null)

  const refreshAccount = useCallback(async () => {
    if (!userId) return null
    setAccountError(null)
    try {
      const data = await api('/api/me')
      setAccount(data)
      setAccountStatus('ready')
      return data
    } catch (err) {
      // A signed-in user whose account call fails is not signed out — surface
      // the error and let them retry rather than bouncing them to login.
      setAccountError(err)
      setAccountStatus('error')
      return null
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null
      return
    }
    if (loadedFor.current === userId) return
    loadedFor.current = userId
    setAccountStatus('loading')
    refreshAccount()
  }, [userId, refreshAccount])

  const signInWithGoogle = useCallback(async () => {
    if (!isConfigured) return
    setSigningIn(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Land back on the app root; detectSessionInUrl picks up the code.
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) {
      setAuthError(error.message)
      setSigningIn(false)
    }
    // On success the browser navigates away, so there is no success branch.
  }, [])

  const signOut = useCallback(async () => {
    if (!isConfigured) return
    await supabase.auth.signOut()
    setAccount(null)
    setAccountStatus('idle')
    window.location.hash = '/dashboard'
  }, [])

  const value = useMemo(() => {
    const entitlement = account?.entitlement || EMPTY_ENTITLEMENT
    return {
      configured: isConfigured,
      authStatus,
      session,
      user: account?.user || session?.user || null,
      userId,

      account,
      accountStatus,
      accountError,
      refreshAccount,

      entitlement,
      // Convenience: `can.blink` reads better at call sites than digging into
      // entitlement.features every time. The server still decides.
      can: entitlement.features,

      signingIn,
      authError,
      signInWithGoogle,
      signOut,
    }
  }, [
    authStatus,
    session,
    userId,
    account,
    accountStatus,
    accountError,
    refreshAccount,
    signingIn,
    authError,
    signInWithGoogle,
    signOut,
  ])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

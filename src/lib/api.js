import { supabase } from './supabase.js'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const isApiConfigured = Boolean(BASE)

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    Object.assign(this, extra)
  }
  /** The server tells us which plan would unlock this. */
  get needsUpgrade() {
    return this.status === 403 && Boolean(this.upgradeTo)
  }
}

/**
 * Call the reelmint API with the current Supabase session attached.
 *
 * Every route except /api/plans needs the bearer token, so it is attached
 * unconditionally rather than per call.
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  if (!BASE) {
    throw new ApiError(0, 'not_configured', 'VITE_API_URL is not set — see DEPLOY.md.')
  }

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`
    }
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.')
  }

  // 204s and empty bodies are legitimate; do not choke on them.
  const text = await res.text()
  const json = text ? safeParse(text) : null

  if (!res.ok) {
    const e = json?.error || {}
    throw new ApiError(res.status, e.code || 'error', e.message || `Request failed (${res.status})`, {
      feature: e.feature,
      tier: e.tier,
      upgradeTo: e.upgradeTo,
    })
  }
  return json
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * The one place that talks to Instagram.
 *
 * This is the Instagram API *with Instagram Login* — `graph.instagram.com` and
 * the `instagram_business_*` scopes — not the older Facebook-Login flow. The
 * difference matters at signup: the old flow requires the account to be linked
 * to a Facebook Page, which is the step most people abandon. This one needs
 * only a Professional (Business or Creator) account.
 *
 * Two things about this API shape the code below more than anything else:
 *
 *  1. It will not accept bytes. You hand it a URL and Meta's servers fetch the
 *     media themselves, which is why every publish path has to get the image
 *     somewhere publicly reachable first.
 *  2. Publishing is not one call. A container is created, Meta processes it
 *     asynchronously, and only a FINISHED container can be published. Skipping
 *     the wait is the classic way to get a carousel that publishes four slides.
 */

const BASE = 'https://graph.instagram.com'
const VERSION = 'v21.0'

export class InstagramError extends Error {
  constructor(message, { code, subcode, status } = {}) {
    super(message)
    this.name = 'InstagramError'
    this.code = code
    this.subcode = subcode
    this.status = status
  }
}

async function request(path, { method = 'GET', params = {}, token } = {}) {
  const url = new URL(`${BASE}/${VERSION}/${path}`.replace(/\/+$/, ''))
  const body = new URLSearchParams()

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (method === 'GET') url.searchParams.set(k, String(v))
    else body.set(k, String(v))
  }
  // The token goes in the query string on GET and the body on POST, never in a
  // header — Meta accepts it either way, but a token in a URL ends up in access
  // logs, so POSTs keep it out of them.
  if (method === 'GET') url.searchParams.set('access_token', token)
  else body.set('access_token', token)

  const res = await fetch(url, {
    method,
    ...(method === 'POST'
      ? { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      : {}),
  })

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (!res.ok || data?.error) {
    const e = data?.error || {}
    throw new InstagramError(e.message || `Instagram returned ${res.status}`, {
      code: e.code,
      subcode: e.error_subcode,
      status: res.status,
    })
  }
  return data
}

/** Who the token belongs to. `user_id` is what every publish call is keyed on. */
export async function me(token) {
  return request('me', { params: { fields: 'user_id,username,account_type' }, token })
}

/**
 * Long-lived tokens last 60 days and a refresh resets the clock from now, so a
 * job that runs daily never approaches the cliff. The two rules Meta enforces:
 * the token must be at least 24 hours old, and it must not already have
 * expired — an expired one cannot be refreshed at all, only re-authorised by
 * the person.
 */
export async function refreshToken(token) {
  const url = new URL(`${BASE}/refresh_access_token`)
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', token)

  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    const e = data?.error || {}
    throw new InstagramError(e.message || `Refresh failed (${res.status})`, {
      code: e.code,
      subcode: e.error_subcode,
      status: res.status,
    })
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in || 0) }
}

/**
 * Exchange a short-lived token for a long-lived one.
 *
 * Note this errors when handed a token that is *already* long-lived, which is
 * not a failure worth aborting a run for — see the caller in
 * scripts/daily-carousel.mjs. Tokens generated from the App Dashboard button
 * are long-lived already; only tokens from a real authorization_code redirect
 * are short-lived.
 */
export async function exchangeToken(shortLivedToken, appSecret) {
  const url = new URL(`${BASE}/access_token`)
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('access_token', shortLivedToken)

  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    const e = data?.error || {}
    throw new InstagramError(e.message || `Exchange failed (${res.status})`, {
      code: e.code,
      subcode: e.error_subcode,
      status: res.status,
    })
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in || 0) }
}

/** One image of a carousel. Returns the container id. */
export async function createItemContainer({ igUserId, imageUrl, token }) {
  const data = await request(`${igUserId}/media`, {
    method: 'POST',
    params: { image_url: imageUrl, is_carousel_item: true },
    token,
  })
  return data.id
}

/** The carousel itself, wrapping 2–10 item containers. */
export async function createCarouselContainer({ igUserId, children, caption, token }) {
  if (children.length < 2 || children.length > 10) {
    throw new InstagramError(`A carousel needs 2–10 items, got ${children.length}`)
  }
  const data = await request(`${igUserId}/media`, {
    method: 'POST',
    params: { media_type: 'CAROUSEL', children: children.join(','), caption },
    token,
  })
  return data.id
}

/**
 * Block until a container is ready to publish.
 *
 * FINISHED means Meta has fetched and processed the media. ERROR and EXPIRED
 * are terminal; IN_PROGRESS just means wait. An unchecked container published
 * too early is the difference between a five-slide carousel and a broken post.
 */
export async function waitForContainer({ containerId, token, timeoutMs = 120_000, intervalMs = 4000 }) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const data = await request(containerId, {
      params: { fields: 'status_code,status' },
      token,
    })
    const status = data.status_code

    if (status === 'FINISHED') return
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new InstagramError(`Container ${containerId} is ${status}: ${data.status || 'no detail'}`)
    }
    if (Date.now() > deadline) {
      throw new InstagramError(`Container ${containerId} still ${status} after ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/** Publish a finished container. Returns the published media id. */
export async function publishContainer({ igUserId, creationId, token }) {
  const data = await request(`${igUserId}/media_publish`, {
    method: 'POST',
    params: { creation_id: creationId },
    token,
  })
  return data.id
}

/**
 * How many API-published posts are left in the rolling 24 hours.
 *
 * Meta's limit is 50. A daily carousel will never approach it, but a retry loop
 * with a bug in it absolutely can, and this is one cheap call.
 */
export async function publishingLimit({ igUserId, token }) {
  const data = await request(`${igUserId}/content_publishing_limit`, {
    params: { fields: 'config,quota_usage' },
    token,
  })
  const row = data?.data?.[0] || {}
  return { used: row.quota_usage ?? null, quota: row.config?.quota_total ?? 50 }
}

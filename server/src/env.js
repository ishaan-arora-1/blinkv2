import 'dotenv/config'

// Fail at boot rather than on the first request that needs a missing value.
// Railway restarts a crashed deploy loudly; a 500 an hour later is quieter and
// much worse.

function required(name, { allowMissingInDev = false } = {}) {
  const v = process.env[name]
  if (v && v.trim()) return v.trim()
  if (allowMissingInDev && process.env.NODE_ENV !== 'production') return ''
  missing.push(name)
  return ''
}

function optional(name, fallback = '') {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

const missing = []

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '8080')),

  // Where the browser app is served from. Drives CORS and is the origin the
  // server pulls creator reference stills from when conditioning a generation.
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:5199'),
  // Comma-separated extra origins (preview deploys, custom domains).
  extraOrigins: optional('EXTRA_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    // Bypasses RLS. Never send this to a browser.
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // Billing and generation are optional at boot so the app can be stood up in
  // stages — auth and the trial work on their own. A route that needs a missing
  // integration answers 503 with a clear reason rather than the server refusing
  // to start, which would take sign-in down too.
  // Gumroad pings an unsigned form to a URL, so the URL is the secret: the
  // token is compared in constant time on every delivery and the seller id is
  // checked against the payload. Both are optional only so the server still
  // boots without payments configured.
  gumroad: {
    webhookToken: optional('GUMROAD_WEBHOOK_TOKEN'),
    sellerId: optional('GUMROAD_SELLER_ID'),
    baseUrl: optional('GUMROAD_BASE_URL', 'https://ishaana.gumroad.com'),
  },

  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID'),
    keySecret: optional('RAZORPAY_KEY_SECRET'),
    webhookSecret: optional('RAZORPAY_WEBHOOK_SECRET'),
  },


  // Every generation in the product: Blink AI video, animated-carousel images
  // and the slide copy. One vendor and one key.
  //
  // Video used to be Google Veo on a separate balance. When that balance ran
  // dry, Blink AI went down for every paying Growth subscriber while the rest
  // of the product carried on — two balances meant two ways to go dark, and the
  // second one was easy to forget about until a customer found it.
  fal: {
    key: optional('FAL_KEY'),
    // Establishes the character on slide 1.
    imageModel: optional('FAL_IMAGE_MODEL', 'fal-ai/nano-banana'),
    // Holds that character across slides 2..n, conditioned on slide 1.
    editModel: optional('FAL_EDIT_MODEL', 'fal-ai/nano-banana/edit'),
    // Writes the slide copy and the character brief.
    textModel: optional('FAL_TEXT_MODEL', 'google/gemini-flash-1.5'),

    // Blink AI. Two entries because the model family splits text-to-video from
    // image-to-video, and a generation anchored to a creator still needs the
    // second one.
    //
    // Veo 3.1 Fast, on fal. This was Wan 2.2, which renders no audio at all —
    // every clip came out silent while the app told people otherwise, and a
    // silent UGC ad is not a deliverable. Veo generates a matching soundtrack
    // in the same pass, so there is no second vendor and no stitching step.
    // It also reaches 1080p, where Wan stopped at 720p.
    //
    // It costs materially more per second, which is what the 25-a-month cap
    // below is for.
    // Veo 3.1 Fast was deprecated on fal on 2026-11-17 and cost $0.10 a second
    // with audio off. MiniMax H3 Max is $0.03 — fal describe it as post-trained
    // for stronger prompt adherence and better aesthetics "with no compromises
    // on output quality", which is the reason it is the default rather than
    // h3-max-turbo at $0.015. Turbo is one env var away once its output has
    // been eyeballed against real reels; the payload dialect is identical, so
    // nothing but this string has to change. See sceneInputFor in video.js.
    videoModel: optional('FAL_VIDEO_MODEL', 'minimax/h3-max/text-to-video'),
    videoImageModel: optional('FAL_VIDEO_IMAGE_MODEL', 'minimax/h3-max/image-to-video'),

    // Multiframe's narration. ElevenLabs through fal, so it bills against the
    // same key as everything else — the reason video left Google's own balance.
    //
    // Multiframe clips are rendered silent and this is the only voice in the
    // reel: Veo cannot hold one voice across separate generations, so a
    // four-scene reel came back in four of them.
    voiceModel: optional('FAL_VOICE_MODEL', 'fal-ai/elevenlabs/tts/eleven-v3'),

    // Ad Ideas: the product read, the angles, the hooks and the scripts. A
    // separate model from textModel on purpose — slide copy is a few words and
    // any model will do, but a hook is the whole ad and the difference between
    // a cheap model and a good one is the difference between "Introducing X"
    // and something that stops a thumb.
    copyModel: optional('FAL_COPY_MODEL', 'anthropic/claude-haiku-5.5'),

    // AI Actors: a still portrait and a narration track in, a lip-synced
    // talking video out. Kling's v2 Standard avatar is $0.056 a second — about
    // half what Blink AI scenes used to cost — so it spends from the same
    // seconds allowance one-for-one with room to spare.
    avatarModel: optional('FAL_AVATAR_MODEL', 'fal-ai/kling-video/ai-avatar/v2/standard'),
  },

  // The monthly allowances used to live here as two flat numbers. They are now
  // per tier — see ALLOWANCE in entitlements.js — because there are three plans
  // and the allowance is what separates two of them. A number that differs by
  // plan is product policy, not deployment configuration.
}

env.razorpay.configured = Boolean(
  env.razorpay.keyId && env.razorpay.keySecret && env.razorpay.webhookSecret
)
env.fal.configured = Boolean(env.fal.key)

/**
 * Browsers send an Origin with no trailing slash and in lower case. A URL
 * pasted from an address bar or a dashboard usually has the slash, and an
 * exact-string comparison then silently rejects the one origin you meant to
 * allow — which looks to the user like the API being down.
 */
export function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '').toLowerCase()
}

export const allowedOrigins = [env.webOrigin, ...env.extraOrigins]
  .map(normalizeOrigin)
  .filter(Boolean)

/**
 * Exact match, or a single-level wildcard such as https://*.vercel.app.
 *
 * The wildcard exists because Vercel gives every preview deployment its own
 * hostname; without it, only production would ever be able to call the API.
 */
export function isOriginAllowed(origin) {
  const o = normalizeOrigin(origin)
  if (!o) return false

  return allowedOrigins.some((pattern) => {
    if (pattern === o) return true
    if (!pattern.includes('*')) return false

    const [scheme, rest] = pattern.split('://')
    if (!rest?.startsWith('*.')) return false

    const suffix = rest.slice(1) // ".vercel.app"
    return o.startsWith(`${scheme}://`) && o.endsWith(suffix) && o.length > `${scheme}://`.length + suffix.length
  })
}

if (missing.length) {
  console.error(
    `\n  Missing required environment variables:\n${missing.map((m) => `    · ${m}`).join('\n')}\n\n` +
      `  Copy server/.env.example to server/.env and fill it in (see DEPLOY.md).\n`
  )
  process.exit(1)
}

// Say plainly at boot what is and is not wired up, so a 503 later is never a
// surprise.
if (!env.razorpay.configured) {
  console.warn(
    '  ⚠ Razorpay is not configured — subscriptions and webhooks will return 503.\n' +
      '    Trials still work, so sign-in and the app are fully usable.'
  )
}
if (!env.fal.configured) {
  console.warn('  ⚠ FAL_KEY is not set — Blink AI and animated carousels will return 503.')
}

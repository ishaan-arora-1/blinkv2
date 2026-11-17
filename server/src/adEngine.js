import dns from 'node:dns/promises'
import net from 'node:net'
import { env } from './env.js'
import { ApiError, badRequest } from './middleware/errors.js'

/**
 * Ad Ideas: a product link in, a strategy and a stack of ads out.
 *
 * Two jobs. `importProduct` reads a product page — any shop, any SaaS landing
 * page — and turns it into the things an ad is written from: what it is, who
 * it is for, what hurts before they have it and what changes after. `writeAds`
 * turns that into hooks and scripts, each one already shaped for the format
 * that will film it.
 *
 * Neither renders anything, so both are cheap — a fraction of a cent of text
 * per call — which is what lets them sit on the free tier. That is the point
 * of them commercially: a free account sees thirty ads written for its own
 * product before it has paid for anything, and every one of them has a button
 * that films it.
 */

// ─── fetching a page, safely ────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 4

/**
 * Refuse addresses on our own side of the internet.
 *
 * The URL comes from a customer and the request is made from inside Railway,
 * so without this a link to 169.254.169.254 or to localhost is a way to make
 * the API read things only the API can reach. Checked against every resolved
 * address and again on every redirect hop, since a public host can 302 to a
 * private one.
 */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  if (v6 === '::1' || v6 === '::') return true
  if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') ||
      v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff')) return true
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateAddress(mapped[1]) : false
}

async function assertPublic(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('That link has to start with http:// or https://.')
  if (url.port && !['80', '443'].includes(url.port)) throw badRequest('That link points at an unusual port we do not fetch.')
  if (url.username || url.password) throw badRequest('Links with a username or password in them are not fetched.')

  let addrs
  try {
    addrs = await dns.lookup(url.hostname, { all: true })
  } catch {
    throw new ApiError(422, 'link_unresolvable', `We could not find ${url.hostname}. Check the link.`)
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ApiError(422, 'link_not_public', 'That link is not on the public internet.')
  }
}

/** Normalise what someone pasted. "myshop.com/products/x" is a link too. */
export function parseLink(raw) {
  let s = String(raw || '').trim()
  if (!s) return null
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!u.hostname.includes('.')) return null
    return u
  } catch {
    return null
  }
}

/**
 * GET a page as a browser would, following redirects by hand so each hop is
 * checked, and stopping at a size cap rather than reading a 400 MB file into
 * memory because someone pasted a link to one.
 */
async function fetchPage(start, { accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' } = {}) {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)

    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)
    let res
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: abort.signal,
        headers: {
          // Plenty of shops answer a bare fetch with a bot wall. A normal
          // browser's headers get the same page a customer sees.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
          Accept: accept,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') throw new ApiError(504, 'link_timeout', 'That page took too long to load.')
      throw new ApiError(502, 'link_unreachable', 'We could not reach that page.')
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer)
      url = new URL(res.headers.get('location'), url)
      continue
    }

    try {
      if (!res.ok) {
        throw new ApiError(
          422,
          'link_blocked',
          res.status === 403 || res.status === 429 || res.status === 503
            ? 'That site blocks automated visits. Describe the product instead and we will work from that.'
            : `That page answered ${res.status}. Check the link, or describe the product instead.`
        )
      }

      const reader = res.body?.getReader()
      if (!reader) return { url, body: '', contentType: res.headers.get('content-type') || '' }
      const chunks = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_PAGE_BYTES) {
          abort.abort()
          break
        }
        chunks.push(value)
      }
      return {
        url,
        body: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'),
        contentType: res.headers.get('content-type') || '',
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new ApiError(422, 'link_redirect_loop', 'That link redirects too many times.')
}

// ─── reading a page ─────────────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

function attrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? '')
  }
  return out
}

/** Every <meta> on the page, keyed by property/name. First one wins. */
function metas(html) {
  const out = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0])
    const key = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (key && a.content && !(key in out)) out[key] = a.content.trim()
  }
  return out
}

/** All JSON-LD blocks, flattened, so a Product inside an @graph is found. */
function jsonLd(html) {
  const found = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    found.push(node)
    if (node['@graph']) walk(node['@graph'])
    if (node.mainEntity) walk(node.mainEntity)
  }
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()))
    } catch {
      // Hand-written JSON-LD is broken surprisingly often. One bad block is
      // not a reason to ignore the rest of the page.
    }
  }
  return found
}

const isType = (n, t) => [].concat(n?.['@type'] || []).some((x) => String(x).toLowerCase() === t)

function imagesOf(v) {
  if (!v) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(imagesOf)
  if (typeof v === 'object') return imagesOf(v.url || v.contentUrl || v['@id'])
  return []
}

/** The words a person would read on the page, roughly. */
function visibleText(html) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Shopify stores answer `<product url>.js` with the product as JSON — every
 * image, the real description and the price — which is better than anything
 * on the HTML page. A large share of the shops buying UGC ads are on Shopify,
 * so it is worth one extra request to try.
 */
async function shopifyProduct(url, html) {
  if (!/\/products\/[^/?#]+/.test(url.pathname)) return null
  if (html && !/shopify/i.test(html)) return null
  try {
    const jsUrl = new URL(url)
    jsUrl.search = ''
    jsUrl.hash = ''
    jsUrl.pathname = jsUrl.pathname.replace(/\/$/, '') + '.js'
    const { body } = await fetchPage(jsUrl, { accept: 'application/json' })
    const p = JSON.parse(body)
    if (!p?.title) return null
    return {
      name: p.title,
      brand: p.vendor || null,
      description: visibleText(p.description || ''),
      images: (p.images || []).map((s) => (s.startsWith('//') ? `https:${s}` : s)),
      price: typeof p.price === 'number' ? (p.price / 100).toFixed(2) : null,
      currency: null,
    }
  } catch {
    return null
  }
}

/**
 * Everything we can learn about a product from its page, before any model is
 * involved. Structured data first, since a shop's own JSON-LD is the most
 * reliable statement of what the product is; Open Graph next; the page text
 * last, for the model to read.
 */
export async function readProductPage(link) {
  const { url, body } = await fetchPage(link)
  const html = body || ''

  const meta = metas(html)
  const ld = jsonLd(html)
  const product = ld.find((n) => isType(n, 'product')) || null
  const org = ld.find((n) => isType(n, 'organization') || isType(n, 'brand')) || null
  const shop = await shopifyProduct(url, html)

  const offer = [].concat(product?.offers || [])[0] || null
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()

  const rawImages = [
    ...(shop?.images || []),
    ...imagesOf(product?.image),
    meta['og:image'], meta['og:image:url'], meta['og:image:secure_url'], meta['twitter:image'], meta['twitter:image:src'],
  ].filter(Boolean)

  const images = []
  for (const src of rawImages) {
    try {
      const abs = new URL(src.startsWith('//') ? `https:${src}` : src, url).toString().replace(/^http:/, 'https:')
      // The same photo is often listed twice — once on the CDN, once through
      // the shop's own domain. The filename is what identifies it.
      const key = abs.split('?')[0].split('/').pop()
      if (!/^https:/.test(abs) || images.some((i) => i.split('?')[0].split('/').pop() === key)) continue
      // Logos, sprites and tracking pixels are not product photos.
      if (/\.(svg|ico)(\?|$)/i.test(abs) || /(logo|favicon|sprite|pixel)/i.test(abs)) continue
      images.push(abs)
    } catch {
      // A relative path that does not resolve is just skipped.
    }
    if (images.length >= 8) break
  }

  return {
    url: url.toString(),
    site: url.hostname.replace(/^www\./, ''),
    name: shop?.name || product?.name || meta['og:title'] || meta['twitter:title'] || title || null,
    brand:
      shop?.brand ||
      (typeof product?.brand === 'string' ? product.brand : product?.brand?.name) ||
      org?.name ||
      meta['og:site_name'] ||
      null,
    description:
      shop?.description?.slice(0, 1200) ||
      (product?.description ? visibleText(String(product.description)).slice(0, 1200) : null) ||
      meta['og:description'] ||
      meta.description ||
      meta['twitter:description'] ||
      null,
    price: shop?.price || offer?.price || meta['product:price:amount'] || meta['og:price:amount'] || null,
    currency: offer?.priceCurrency || meta['product:price:currency'] || meta['og:price:currency'] || null,
    images,
    text: visibleText(html).slice(0, 7000),
  }
}

// ─── the copywriter ─────────────────────────────────────────────────────────

const SYSTEM = [
  'You are the best direct-response creative strategist working in paid social.',
  'You write UGC-style ads for TikTok, Instagram Reels and YouTube Shorts that stop the scroll in the first second',
  'and convert. You write the way real people talk on camera: short sentences, plain words, specific details,',
  'no corporate language, no hashtags, no emojis, no exclamation marks in every line, and never the words',
  '"introducing", "game-changer", "revolutionary", "elevate", "unlock", "seamless" or "look no further".',
  'You never invent claims, prices, discounts, awards, certifications or statistics that are not in the brief.',
  'You answer with JSON only — no prose before or after it, no markdown fence.',
].join(' ')

async function llm(prompt, { maxTokens = 3500, temperature = 0.9 } = {}) {
  if (!env.fal.configured) {
    throw new ApiError(503, 'generation_not_configured', 'Ad writing is not set up on this server yet.')
  }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 75_000)
  let res
  try {
    res = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: { Authorization: `Key ${env.fal.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.fal.copyModel,
        system_prompt: SYSTEM,
        prompt,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: abort.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError(504, 'copy_timeout', 'Writing took too long. Try again.')
    throw new ApiError(502, 'copy_unreachable', 'Could not reach the copywriter.')
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok || data?.error) {
    console.warn(`[adEngine] ${res.status} from any-llm — ${text.slice(0, 300)}`)
    const detail = typeof data?.detail === 'string' ? data.detail : ''
    if (/locked|top_?up/i.test(detail)) {
      throw new ApiError(503, 'copy_out_of_credit', 'Writing is paused because our generation account is out of credit. This is on us.')
    }
    throw new ApiError(502, 'copy_failed', 'The copywriter could not write that. Try again.')
  }
  return String(data?.output || '')
}

/** Models fence JSON whatever the prompt says, and sometimes add a sentence. */
export function parseJson(raw) {
  let s = String(raw || '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  const open = Math.min(...['{', '['].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c))))
  const close = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (!Number.isFinite(open) || close <= open) throw new Error(`no JSON in: ${s.slice(0, 160)}`)
  return JSON.parse(s.slice(open, close + 1))
}

async function llmJson(prompt, opts) {
  try {
    return parseJson(await llm(prompt, opts))
  } catch (err) {
    if (err instanceof ApiError) throw err
    // One retry, colder. A malformed answer is almost always a one-off.
    try {
      return parseJson(await llm(prompt, { ...opts, temperature: 0.5 }))
    } catch (err2) {
      if (err2 instanceof ApiError) throw err2
      throw new ApiError(502, 'copy_malformed', 'The copywriter answered in a shape we could not read. Try again.')
    }
  }
}

const CATEGORIES = [
  'Mobile app', 'SaaS / web app', 'Beauty & skincare', 'Health & wellness', 'Fitness', 'Fashion & apparel',
  'Food & drink', 'Home & living', 'Pets', 'Baby & kids', 'Tech & gadgets', 'Education & courses',
  'Finance', 'Travel', 'Local business', 'Other',
]

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const list = (v, n, each) => (Array.isArray(v) ? v : []).map((x) => clip(x, each)).filter(Boolean).slice(0, n)

/**
 * Read the product the way a strategist would before writing a single ad.
 *
 * `page` is what readProductPage found, or null when the customer described
 * the product in their own words instead (`notes`). Either is enough.
 */
export async function analyzeProduct({ page, notes }) {
  const facts = page
    ? [
        `URL: ${page.url}`,
        page.name && `Name on the page: ${page.name}`,
        page.brand && `Brand: ${page.brand}`,
        page.price && `Price: ${page.price}${page.currency ? ` ${page.currency}` : ''}`,
        page.description && `Description: ${page.description}`,
        `Page text (truncated):\n${page.text}`,
      ].filter(Boolean).join('\n')
    : ''

  const prompt = `Here is everything we know about a product.

${facts}
${notes ? `\nThe owner describes it like this: ${clip(notes, 1500)}` : ''}

Work out the marketing strategy for UGC video ads. Return JSON exactly in this shape:
{
  "productName": "the product's short name",
  "brandName": "the brand or company name, or null if it is not stated anywhere",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "oneLiner": "what it is and what it does for the buyer, in under 14 words",
  "audience": "the specific person most likely to buy, in one sentence",
  "personas": ["3 distinct buyer personas, each a short phrase"],
  "painPoints": ["5 specific frustrations the buyer has before they own this, in their own words"],
  "benefits": ["5 concrete outcomes after using it, specific not generic"],
  "objections": ["3 reasons someone would hesitate to buy"],
  "proof": ["anything on the page that builds trust: reviews, numbers, guarantees — empty if none"],
  "tone": "how the brand should sound, 3-5 words",
  "angles": [
    { "id": "short-kebab-id", "name": "2-4 word angle name", "insight": "why this angle works for this product, one sentence", "format": one of ["talking-head", "problem-solution", "unboxing", "day-in-the-life", "before-after", "listicle", "skit", "testimonial", "comparison", "demo"] }
  ]
}
Give exactly 6 angles, each genuinely different.`

  const d = await llmJson(prompt, { maxTokens: 2500, temperature: 0.7 })

  // Models fill a field they were told to leave empty with "Unknown" or
  // "N/A", and that word then ends up read aloud in every script.
  const known = (v) => (v && !/^(unknown|n\/?a|none|null|not (stated|specified|provided))$/i.test(String(v).trim()) ? v : null)

  return {
    productName: clip(known(d.productName) || page?.name, 80) || 'Your product',
    brandName: clip(known(d.brandName) || page?.brand, 80) || null,
    category: CATEGORIES.includes(d.category) ? d.category : 'Other',
    oneLiner: clip(d.oneLiner, 160),
    audience: clip(d.audience, 220),
    personas: list(d.personas, 3, 100),
    painPoints: list(d.painPoints, 5, 180),
    benefits: list(d.benefits, 5, 180),
    objections: list(d.objections, 3, 180),
    proof: list(d.proof, 4, 180),
    tone: clip(d.tone, 60),
    angles: (Array.isArray(d.angles) ? d.angles : []).slice(0, 6).map((a, i) => ({
      id: clip(a?.id, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || `angle-${i + 1}`,
      name: clip(a?.name, 40) || `Angle ${i + 1}`,
      insight: clip(a?.insight, 220),
      format: clip(a?.format, 30) || 'talking-head',
    })),
  }
}

/** The frameworks Hook Lab writes in, shown to the customer as filters. */
export const FRAMEWORKS = [
  { id: 'any', name: 'Mix of everything' },
  { id: 'pas', name: 'Problem → agitate → solve' },
  { id: 'testimonial', name: 'Honest testimonial' },
  { id: 'pov', name: 'POV / storytime' },
  { id: 'listicle', name: '3 reasons why' },
  { id: 'us-vs-them', name: 'Us vs. the alternative' },
  { id: 'unboxing', name: 'Unboxing / first look' },
  { id: 'founder', name: 'Founder story' },
  { id: 'controversial', name: 'Hot take' },
]

export const LENGTHS = { short: 15, medium: 30, long: 45 }
export const MAX_ADS = 10

/**
 * Write a batch of complete ads.
 *
 * Every ad is a hook (the first line, what decides whether anyone watches),
 * a script to be read aloud at the target length, an on-screen caption, a
 * shot list for Blink AI, and a CTA. Written as a set so the batch does not
 * repeat itself — five variants of one hook is the commonest way generated
 * copy fails at the job, which is to give an ad account enough genuinely
 * different creative to test.
 */
export async function writeAds({ product, angle, framework, length, count, avoid }) {
  const seconds = LENGTHS[length] || LENGTHS.medium
  // Spoken UGC runs at roughly 2.6 words a second.
  const words = Math.round(seconds * 2.6)
  const fw = FRAMEWORKS.find((f) => f.id === framework) || FRAMEWORKS[0]
  const n = Math.max(1, Math.min(MAX_ADS, Math.round(Number(count) || 6)))

  const brief = [
    product.brandName
      ? `Product: ${product.productName} by ${product.brandName}`
      : `Product: ${product.productName} (no brand name is known — refer to it by what it is, never invent a name)`,
    product.oneLiner && `What it is: ${product.oneLiner}`,
    product.category && `Category: ${product.category}`,
    product.audience && `Buyer: ${product.audience}`,
    product.painPoints?.length && `Their frustrations: ${product.painPoints.join('; ')}`,
    product.benefits?.length && `Outcomes: ${product.benefits.join('; ')}`,
    product.objections?.length && `Objections to handle: ${product.objections.join('; ')}`,
    product.proof?.length && `Real proof you may use: ${product.proof.join('; ')}`,
    product.tone && `Brand tone: ${product.tone}`,
  ].filter(Boolean).join('\n')

  const prompt = `${brief}

${angle ? `Angle for every ad in this batch: ${clip(angle, 300)}` : 'Spread the batch across different angles.'}
Framework: ${fw.id === 'any' ? 'vary the framework across the batch — PAS, testimonial, POV, listicle, comparison, unboxing, hot take' : fw.name}.
${avoid?.length ? `Do NOT reuse or paraphrase these hooks, they already exist: ${avoid.slice(0, 30).map((h) => JSON.stringify(clip(h, 140))).join(', ')}` : ''}

Write ${n} different UGC video ads. Each one is spoken by a single creator, straight to camera, in first person.
The script must be about ${words} words (${seconds} seconds spoken) and must start with the hook, word for word.

Return a JSON array of ${n} objects in exactly this shape:
[{
  "hook": "the first line — under 12 words, specific, creates curiosity or calls out the viewer",
  "framework": "which framework this uses, 1-3 words",
  "angle": "the angle, 2-4 words",
  "script": "the full spoken script, starting with the hook, ~${words} words, no stage directions",
  "caption": "on-screen text for the first 2 seconds, under 8 words",
  "visual": "one sentence: what the video shows while this is said — setting, action, how the product appears",
  "cta": "the last line's call to action, under 8 words",
  "score": an integer 1-100, your honest prediction of how hard this hook stops the scroll
}]`

  const raw = await llmJson(prompt, { maxTokens: 400 + n * 380, temperature: 1 })
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.ads) ? raw.ads : []

  return arr
    .map((a) => ({
      hook: clip(a?.hook, 160),
      framework: clip(a?.framework, 40),
      angle: clip(a?.angle, 40),
      script: clip(a?.script, 900),
      caption: clip(a?.caption, 80),
      visual: clip(a?.visual, 300),
      cta: clip(a?.cta, 80),
      score: Math.max(1, Math.min(100, Math.round(Number(a?.score) || 70))),
      seconds,
    }))
    .filter((a) => a.hook && a.script)
    .slice(0, n)
}

/**
 * One script, for the AI Actors composer's "write it for me" button, which
 * starts from whatever the brand already says about itself rather than from a
 * product page.
 */
export async function writeOneScript({ product, brief, length }) {
  const [ad] = await writeAds({ product, angle: brief, framework: 'any', length, count: 1 })
  if (!ad) throw new ApiError(502, 'copy_failed', 'The copywriter came back empty. Try again.')
  return ad
}

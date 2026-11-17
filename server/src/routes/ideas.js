import { Router } from 'express'
import { admin } from '../supabase.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, badRequest, ApiError } from '../middleware/errors.js'
import {
  parseLink,
  readProductPage,
  analyzeProduct,
  writeAds,
  FRAMEWORKS,
  LENGTHS,
  MAX_ADS,
} from '../adEngine.js'

// requireAuth is applied where this router is mounted.
export const ideasRouter = Router()

/**
 * Runs a day, per tier.
 *
 * Not an allowance anyone is sold — the plans say "unlimited" for Studio and
 * Agency and that has to be true in practice — but each run is a paid model
 * call, and a script hammering the endpoint is a bill. The numbers are set so
 * a person working flat out never meets them on a paid plan, and so a free
 * account gets enough to be convinced rather than enough to never pay.
 */
const DAILY = {
  free:    { import: 3,   write: 6 },
  creator: { import: 25,  write: 60 },
  studio:  { import: 200, write: 400 },
  agency:  { import: 400, write: 800 },
}

const KIND = { import: 'ideas.import', write: 'ideas.write' }

function dayStart() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

async function usedToday(userId, kind) {
  const { count, error } = await admin
    .from('generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', KIND[kind])
    .gte('created_at', dayStart())
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function spend(req, kind) {
  const tier = req.entitlement?.tier || 'free'
  const limit = (DAILY[tier] || DAILY.free)[kind]
  const used = await usedToday(req.user.id, kind)
  if (used >= limit) {
    const what = kind === 'import' ? 'product reads' : 'batches of ads'
    throw new ApiError(
      429,
      'daily_limit_reached',
      tier === 'free'
        ? `That is all ${limit} free ${what} for today. Creator raises it to ${DAILY.creator[kind]} a day, and Studio makes it unlimited.`
        : `That is ${limit} ${what} today — the fair-use ceiling. It resets at midnight UTC.`,
      { upgradeTo: tier === 'free' ? 'creator' : undefined }
    )
  }
  return { used: used + 1, limit }
}

/** Recorded after the model has answered, so a failed run costs nothing. */
async function record(req, kind, meta) {
  await admin.from('generation_events').insert({
    user_id: req.user.id,
    kind: KIND[kind],
    cost_units: 1,
    meta,
  })
}

ideasRouter.get(
  '/options',
  requireFeature('ideas'),
  wrap(async (req, res) => {
    const tier = req.entitlement.tier || 'free'
    const [imports, writes] = await Promise.all([usedToday(req.user.id, 'import'), usedToday(req.user.id, 'write')])
    res.json({
      frameworks: FRAMEWORKS,
      lengths: Object.entries(LENGTHS).map(([id, seconds]) => ({ id, seconds })),
      maxAds: MAX_ADS,
      usage: {
        import: { used: imports, limit: (DAILY[tier] || DAILY.free).import },
        write: { used: writes, limit: (DAILY[tier] || DAILY.free).write },
      },
    })
  })
)

/**
 * Read a product and work out how to sell it.
 *
 * Takes a link, or a description, or both. A link to a site that blocks us is
 * not a dead end — the client falls back to asking for a description, which
 * is why `notes` alone is a valid request.
 */
ideasRouter.post(
  '/import',
  requireFeature('ideas'),
  wrap(async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim()
    const notes = String(req.body?.notes || '').trim().slice(0, 1500)
    if (!rawUrl && notes.length < 12) throw badRequest('Paste a product link, or describe the product in a sentence or two.')

    const link = rawUrl ? parseLink(rawUrl) : null
    if (rawUrl && !link) throw badRequest('That does not look like a link. Try something like yourshop.com/products/item.')

    const quota = await spend(req, 'import')

    let page = null
    if (link) {
      try {
        page = await readProductPage(link)
      } catch (err) {
        // With a description to fall back on, a blocked page is a footnote,
        // not a failure — carry on from the description.
        if (!notes) throw err
        console.warn(`[ideas] could not read ${link.hostname}: ${err.message}`)
      }
    }

    const analysis = await analyzeProduct({ page, notes })
    await record(req, 'import', { host: link?.hostname || null })

    res.json({
      product: {
        url: page?.url || null,
        site: page?.site || null,
        name: page?.name || analysis.productName,
        price: page?.price || null,
        currency: page?.currency || null,
        description: page?.description || notes || null,
        images: page?.images || [],
      },
      analysis,
      usage: quota,
    })
  })
)

/** A batch of complete ads for one angle and framework. */
ideasRouter.post(
  '/write',
  requireFeature('ideas'),
  wrap(async (req, res) => {
    const p = req.body?.product
    if (!p || typeof p !== 'object' || !String(p.productName || '').trim()) {
      throw badRequest('Read a product first, then write ads for it.')
    }
    // Only the fields the prompt uses, each clipped — this object comes from
    // the browser and goes into a prompt.
    const str = (v, n) => String(v ?? '').slice(0, n)
    const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n).map((x) => str(x, 200)) : [])
    const product = {
      productName: str(p.productName, 80),
      brandName: str(p.brandName, 80),
      oneLiner: str(p.oneLiner, 200),
      category: str(p.category, 40),
      audience: str(p.audience, 240),
      painPoints: arr(p.painPoints, 5),
      benefits: arr(p.benefits, 5),
      objections: arr(p.objections, 3),
      proof: arr(p.proof, 4),
      tone: str(p.tone, 60),
    }

    const length = Object.hasOwn(LENGTHS, req.body?.length) ? req.body.length : 'medium'
    const framework = FRAMEWORKS.some((f) => f.id === req.body?.framework) ? req.body.framework : 'any'
    const count = Math.max(1, Math.min(MAX_ADS, Math.round(Number(req.body?.count) || 6)))
    const angle = str(req.body?.angle, 300)
    const avoid = arr(req.body?.avoid, 30)

    const quota = await spend(req, 'write')
    const ads = await writeAds({ product, angle, framework, length, count, avoid })
    if (!ads.length) throw new ApiError(502, 'copy_failed', 'The copywriter came back empty. Try again.')
    await record(req, 'write', { count: ads.length, framework, length })

    res.json({ ads, usage: quota })
  })
)

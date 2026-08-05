import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, notFound, ApiError } from '../middleware/errors.js'
import { CHARACTERS } from '../characters.js'
import { download } from '../fal.js'
import { SLIDE_COUNT, validate, writeCopy, renderSlides } from '../animated.js'

// requireAuth is applied where this router is mounted, so every route below can
// assume req.user exists.
export const animatedRouter = Router()

const MAX_IN_FLIGHT = 2
const MONTHLY_LIMIT = env.animatedMonthlyLimit

animatedRouter.get('/options', (_req, res) =>
  res.json({
    slideCount: SLIDE_COUNT,
    // Briefs deliberately omitted — the client picks by id and never sees the
    // prompt text.
    characters: CHARACTERS.map(({ id, name, blurb }) => ({ id, name, blurb })),
  })
)

/**
 * Generate an animated carousel.
 *
 * Responds as soon as the rows exist and finishes the work behind it, the same
 * shape as Blink AI: the render is half a minute, which is too long to hold a
 * request open across a proxy and far too long to hold a browser on a spinner
 * with nothing to show.
 */
animatedRouter.post(
  '/generate',
  requireFeature('animated'),
  wrap(async (req, res) => {
    if (!env.fal.configured) {
      throw new ApiError(503, 'generation_not_configured', 'Animated carousels are not set up on this server yet.')
    }

    const { topic, slideCount, character } = validate(req.body)

    const { count: inFlight } = await admin
      .from('carousels')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', ['pending', 'rendering'])

    if ((inFlight ?? 0) >= MAX_IN_FLIGHT) {
      throw new ApiError(
        429,
        'too_many_in_flight',
        `You already have ${inFlight} carousels rendering. Wait for one to finish.`
      )
    }

    // Calendar month, counted from generation_events so the cap survives the
    // user deleting carousels to reset it.
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const { count: usedThisMonth } = await admin
      .from('generation_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('kind', 'animated.generate')
      .gte('created_at', monthStart.toISOString())

    if ((usedThisMonth ?? 0) >= MONTHLY_LIMIT) {
      throw new ApiError(
        429,
        'monthly_limit_reached',
        `You have used all ${MONTHLY_LIMIT} animated carousels for this month. It resets on the 1st.`
      )
    }

    // Scoped to the caller: a brand id is supplied by the browser, so without
    // the user_id filter one account could generate against another's brand and
    // read its positioning back out of the finished copy.
    const brandId = req.body?.brandId ? String(req.body.brandId) : null
    let brandQuery = admin
      .from('brands')
      .select('id, app_name, category, tagline, accent')
      .eq('user_id', req.user.id)

    // No brandId means an older client that predates multiple brands; fall back
    // to the account's first brand, which is the only one such a client knows.
    brandQuery = brandId
      ? brandQuery.eq('id', brandId)
      : brandQuery.order('created_at', { ascending: true }).limit(1)

    const { data: brand } = await brandQuery.maybeSingle()
    if (brandId && !brand) throw notFound('That brand is not on your account.')

    // Recorded before anything is spent, so a generation is always accounted
    // for even if the vendor call fails immediately afterwards.
    const { data: carousel, error: insertErr } = await admin
      .from('carousels')
      .insert({
        user_id: req.user.id,
        kind: 'animated',
        brand_id: brand?.id ?? null,
        name: topic.length > 34 ? `${topic.slice(0, 34)}…` : topic,
        topic,
        character_id: character.id,
        status: 'rendering',
        slides: [],
      })
      .select('*')
      .single()

    if (insertErr) throw new Error(insertErr.message)

    await admin.from('generation_events').insert({
      user_id: req.user.id,
      kind: 'animated.generate',
      cost_units: slideCount,
      meta: { carousel_id: carousel.id, slides: slideCount, character: character.id },
    })

    // Fire and forget. Failures are written onto the row, which is what the
    // client is polling — an unhandled rejection here would leave a carousel
    // stuck on 'rendering' forever with nothing explaining why.
    build({
      carousel,
      brand: {
        appName: brand?.app_name,
        category: brand?.category,
        tagline: brand?.tagline,
        accent: brand?.accent,
      },
      topic,
      slideCount,
      character,
      userId: req.user.id,
    }).catch(async (err) => {
      console.error(`[animated] ${carousel.id} failed:`, err?.message || err)
      await admin
        .from('carousels')
        .update({ status: 'failed', error: String(err?.message || err).slice(0, 500) })
        .eq('id', carousel.id)
    })

    res.status(201).json({ carouselId: carousel.id, status: 'rendering' })
  })
)

/**
 * Poll a render.
 *
 * Not gated on the feature: a carousel already paid for stays collectable if
 * the plan lapses mid-render. Scoped to the caller's own rows, which is what
 * keeps that from being a way around the gate.
 */
animatedRouter.get(
  '/status/:carouselId',
  wrap(async (req, res) => {
    const { data: carousel } = await admin
      .from('carousels')
      .select('id, status, error, slides, kind')
      .eq('id', req.params.carouselId)
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (!carousel || carousel.kind !== 'animated') throw notFound('That carousel does not exist.')

    const { count: done } = await admin
      .from('carousel_slides')
      .select('id', { count: 'exact', head: true })
      .eq('carousel_id', carousel.id)
      .eq('status', 'ready')

    const { count: total } = await admin
      .from('carousel_slides')
      .select('id', { count: 'exact', head: true })
      .eq('carousel_id', carousel.id)

    res.json({
      carouselId: carousel.id,
      status: carousel.status,
      error: carousel.error,
      ready: done ?? 0,
      total: total ?? 0,
      // Only worth sending once there is something to open.
      slides: carousel.status === 'ready' ? carousel.slides : null,
    })
  })
)

/**
 * Write the copy, render the slides, and assemble the carousel document.
 *
 * Each slide is archived and marked ready as it lands rather than in one batch
 * at the end: they finish out of order, and a failure on the last one should
 * not throw away four images that were already paid for.
 */
async function build({ carousel, brand, topic, slideCount, character, userId }) {
  const { palette, slides: copy } = await writeCopy({ brand, topic, slideCount, character })

  await admin.from('carousels').update({ palette }).eq('id', carousel.id)
  await admin.from('carousel_slides').insert(
    copy.map((s, i) => ({
      carousel_id: carousel.id,
      user_id: userId,
      idx: i,
      action: s.action,
      status: 'pending',
    }))
  )

  const paths = new Array(copy.length).fill(null)

  await renderSlides({
    character,
    palette,
    slides: copy,
    onProgress: async (i, url) => {
      try {
        const { buffer, contentType } = await download(url)
        const path = `${userId}/carousels/${carousel.id}/${String(i).padStart(2, '0')}.png`

        const { error: upErr } = await admin.storage
          .from('generations')
          .upload(path, buffer, { contentType, upsert: true })
        if (upErr) throw new Error(upErr.message)

        paths[i] = path
        await admin
          .from('carousel_slides')
          .update({ status: 'ready', storage_path: path, error: null })
          .eq('carousel_id', carousel.id)
          .eq('idx', i)
      } catch (err) {
        await admin
          .from('carousel_slides')
          .update({ status: 'failed', error: String(err?.message || err).slice(0, 300) })
          .eq('carousel_id', carousel.id)
          .eq('idx', i)
        throw err
      }
    },
  })

  await admin
    .from('carousels')
    .update({
      status: 'ready',
      error: null,
      slides: buildSlideDocs({ copy, paths, accent: brand.accent, appName: brand.appName }),
    })
    .eq('id', carousel.id)
}

/*
 * The slide document the editor reads.
 *
 * Mirrors buildCarousel in src/pages/Carousels.jsx — same layer defaults, same
 * positions — because an animated carousel opens in the same editor and has to
 * behave identically once it is there. The differences are deliberate and
 * small: the background is a generations-bucket reference rather than a set
 * photo, and dim is lower because these backdrops are generated with clear
 * space for the text instead of being photographs the text has to survive.
 */
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`

const layer = (patch) => ({
  id: uid('t'), text: 'Text', x: 50, y: 50, size: 24, weight: 800, color: '#ffffff',
  align: 'center', width: 82, font: 'body', upper: false, pill: 'none', ...patch,
})

function buildSlideDocs({ copy, paths, accent, appName }) {
  const handle = `@${String(appName || 'yourbrand').toLowerCase().replace(/\s+/g, '')}`
  const last = copy.length - 1

  return copy.map((c, i) => {
    const bg = paths[i] ? { bucket: 'generations', path: paths[i] } : null
    const role = i === 0 ? 'hook' : i === last ? 'cta' : 'body'

    // The text sits in the upper third, which is the space the image prompt
    // reserves. A photo carousel centres it because a photograph has no
    // reserved space to aim at.
    const texts = [layer({ text: c.h, y: 20, size: i === 0 ? 30 : 26, font: 'display', width: 86 })]

    if (c.s) {
      texts.push(
        layer({
          text: c.s,
          y: 34,
          size: 15,
          weight: 500,
          color: '#e9e9e9',
          width: 76,
          ...(role === 'cta' ? { pill: 'accent', color: '#101010', weight: 600, width: 70 } : {}),
        })
      )
    }
    if (role === 'hook') {
      texts.push(layer({ text: handle, y: 92, size: 13, weight: 500, color: '#e6e6e6' }))
    }

    return { id: uid('s'), role, bg, dim: 0.18, texts }
  })
}

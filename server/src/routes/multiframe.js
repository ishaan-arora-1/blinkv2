import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, badRequest, notFound, ApiError } from '../middleware/errors.js'
import { download } from '../fal.js'
import {
  validateOptions,
  decodeProductImage,
  startSceneGeneration,
  pollOperation,
  downloadVideo,
} from '../video.js'
import {
  SCENE_COUNT,
  MAX_IDEA,
  VIDEO_NEGATIVE,
  validate,
  planReel,
  renderFrames,
  describeProduct,
  redrawFrame,
  motionPrompt,
} from '../multiframe.js'
import { MONTHLY_LIMIT, CREDIT_KIND, usedThisMonth, usage } from '../blinkCredits.js'

// requireAuth is applied where this router is mounted, so every route below can
// assume req.user exists.
export const multiframeRouter = Router()

const SIGNED_URL_TTL = 60 * 60 // 1 hour

// One reel at a time. Blink AI allows three in flight because each is one clip;
// a reel is up to six, so three of them is eighteen concurrent Veo jobs from a
// single account, which is both a vendor rate-limit problem and a bill.
const MAX_IN_FLIGHT = 1

// Redraws per frame. Frames are cheap beside clips but they are not free, and a
// button that costs money every time it is pressed needs a number on it.
const MAX_FRAME_REVISIONS = 6

// What counts as "in flight" for the one-reel-at-a-time cap: vendor work is
// actually running. 'frames_ready' is deliberately absent — a reel resting
// there has nothing queued and has spent nothing on video, so blocking a new
// reel behind it would punish someone for not having decided yet.
const PENDING = ['pending', 'scripting', 'rendering']

multiframeRouter.get('/options', (_req, res) =>
  res.json({ sceneCount: SCENE_COUNT, maxIdea: MAX_IDEA, monthlyLimit: MONTHLY_LIMIT })
)

/**
 * What is left this month — the same allowance Blink AI spends, deliberately.
 * The form reads it to say how many scenes it can afford before anyone writes
 * an idea they cannot render.
 */
multiframeRouter.get(
  '/usage',
  wrap(async (req, res) => {
    res.json(await usage(req.user.id))
  })
)

/**
 * Start a reel.
 *
 * Answers as soon as the row exists and does the work behind it, the shape both
 * Blink AI and animated carousels use. The difference here is where the
 * background work stops: it plans, renders the frames, and hands every scene to
 * Veo — then it ends, having stored a status URL per scene. The waiting is done
 * by /status, one poll at a time, because a reel is several minutes long and a
 * background task that owns those minutes dies with the next Railway redeploy,
 * taking six paid-for clips with it. Storing the status URLs makes the work
 * recoverable by anyone who asks for it later.
 */
multiframeRouter.post(
  '/generate',
  requireFeature('multiframe'),
  wrap(async (req, res) => {
    if (!env.fal.configured) {
      throw new ApiError(503, 'generation_not_configured', 'Multiframe is not set up on this server yet.')
    }

    const { idea, sceneCount } = validate(req.body)
    const options = validateOptions(req.body)

    // Validated before anything is inserted or spent. decodeProductImage is the
    // same check Blink AI puts a product photo through — a real image data URL,
    // under 8 MB — so the two features refuse the same uploads for the same
    // reasons and say the same thing when they do.
    const productImage = decodeProductImage(req.body?.productImage)
    assertStorableImage(productImage)

    const { count: inFlight } = await admin
      .from('multiframes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', PENDING)

    if ((inFlight ?? 0) >= MAX_IN_FLIGHT) {
      throw new ApiError(
        429,
        'too_many_in_flight',
        'You already have a reel rendering. Wait for it to finish before starting another.'
      )
    }

    // The whole reel is checked against the allowance up front, not scene by
    // scene as it renders. Reserving four and stopping at two would leave
    // somebody with half a video and no way to finish it, having spent the
    // allowance that would have completed it.
    const used = await usedThisMonth(req.user.id)
    const remaining = Math.max(0, MONTHLY_LIMIT - used)
    if (remaining < sceneCount) {
      throw new ApiError(
        429,
        'monthly_limit_reached',
        remaining === 0
          ? `You have used all ${MONTHLY_LIMIT} videos included this month. It resets on the 1st.`
          : `A ${sceneCount}-scene reel costs ${sceneCount} of your ${MONTHLY_LIMIT} monthly videos, and you have ${remaining} left. Try fewer scenes.`
      )
    }

    // Scoped to the caller: the brand id comes from the browser, so without the
    // user_id filter one account could generate against another's brand and read
    // its positioning back out of the finished script.
    const brandId = req.body?.brandId ? String(req.body.brandId) : null
    let brandQuery = admin
      .from('brands')
      .select('id, app_name, category, tagline')
      .eq('user_id', req.user.id)

    brandQuery = brandId
      ? brandQuery.eq('id', brandId)
      : brandQuery.order('created_at', { ascending: true }).limit(1)

    const { data: brand } = await brandQuery.maybeSingle()
    if (brandId && !brand) throw notFound('That brand is not on your account.')

    const { data: reel, error: insertErr } = await admin
      .from('multiframes')
      .insert({
        user_id: req.user.id,
        brand_id: brand?.id ?? null,
        idea,
        scene_count: sceneCount,
        aspect_ratio: options.aspectRatio,
        resolution: options.resolution,
        duration_seconds: options.duration,
        status: 'scripting',
      })
      .select('*')
      .single()

    if (insertErr) throw new Error(insertErr.message)

    // Archived before the build starts, so every later reference to the product
    // is a short signed URL rather than several megabytes of base64 repeated
    // once per scene. A failure here is fatal to the reel on purpose: the whole
    // point of the upload is that the reel is about this object, and silently
    // generating a different one would be worse than saying no.
    let productPath = null
    if (productImage) {
      productPath = `${req.user.id}/multiframes/${reel.id}/product`
      const { bytes, contentType } = decodeToBytes(productImage)
      const { error: upErr } = await admin.storage
        .from('generations')
        .upload(productPath, bytes, { contentType, upsert: true })

      if (upErr) {
        await admin
          .from('multiframes')
          .update({ status: 'failed', error: `could not store the product photo: ${upErr.message}` })
          .eq('id', reel.id)
        throw new ApiError(502, 'product_upload_failed', 'We could not store that product photo. Try again.')
      }
      await admin.from('multiframes').update({ product_path: productPath }).eq('id', reel.id)
    }

    // Fire and forget. Failures are written onto the row the client is polling —
    // an unhandled rejection here would strand a reel on 'scripting' forever
    // with nothing explaining why.
    build({
      reel,
      brand: { appName: brand?.app_name, category: brand?.category, tagline: brand?.tagline },
      idea,
      sceneCount,
      options,
      productPath,
      userId: req.user.id,
    }).catch(async (err) => {
      console.error(`[multiframe] ${reel.id} failed:`, err?.message || err)
      await admin
        .from('multiframes')
        .update({ status: 'failed', error: String(err?.message || err).slice(0, 500) })
        .eq('id', reel.id)
    })

    res.status(201).json({ multiframeId: reel.id, status: 'scripting' })
  })
)

/**
 * Plan the reel, render the opening frames, and hand every scene to Veo.
 *
 * Frames are archived as they land rather than in one batch at the end: they
 * arrive out of order, they are the first evidence the split understood the
 * idea, and one failing should not throw away the ones already paid for.
 */
async function build({ reel, brand, idea, sceneCount, options, productPath, userId }) {
  // Signed for the whole render: the same URL is handed to the image model once
  // per scene, and the frames run concurrently well inside the hour.
  const productUrl = await signedUrl(productPath)

  // Read the photo before planning, so the director is writing about the object
  // the customer actually sells rather than one implied by a sentence.
  const product = await describeProduct(productUrl)

  const plan = await planReel({
    brand,
    idea,
    sceneCount,
    durationSeconds: options.duration,
    product,
  })

  await admin
    .from('multiframes')
    .update({ name: plan.title, script: plan.script, status: 'rendering' })
    .eq('id', reel.id)

  await admin.from('multiframe_scenes').insert(
    plan.scenes.map((s, i) => ({
      multiframe_id: reel.id,
      user_id: userId,
      idx: i,
      description: s.description,
      frame_prompt: s.frame,
      motion_prompt: s.motion,
      status: 'framing',
    }))
  )

  const framePaths = new Array(plan.scenes.length).fill(null)

  await renderFrames({
    scenes: plan.scenes,
    aspectRatio: options.aspectRatio,
    productUrl,
    onFrame: async (i, url) => {
      try {
        const { buffer, contentType } = await download(url)
        const path = `${userId}/multiframes/${reel.id}/${String(i).padStart(2, '0')}-frame.png`

        const { error: upErr } = await admin.storage
          .from('generations')
          .upload(path, buffer, { contentType, upsert: true })
        if (upErr) throw new Error(upErr.message)

        framePaths[i] = path
        await admin
          .from('multiframe_scenes')
          .update({ status: 'frame_ready', frame_path: path, error: null })
          .eq('multiframe_id', reel.id)
          .eq('idx', i)
      } catch (err) {
        await admin
          .from('multiframe_scenes')
          .update({ status: 'failed', error: String(err?.message || err).slice(0, 300) })
          .eq('multiframe_id', reel.id)
          .eq('idx', i)
        throw err
      }
    },
  })

  // Stop here. The clips are the expensive half — one Veo generation per scene
  // out of a monthly 25 — and the frames are the evidence needed to decide
  // whether they are worth spending. Nothing more happens until /videos.
  await admin.from('multiframes').update({ status: 'frames_ready' }).eq('id', reel.id)
}

/**
 * Film the reel: hand every drawn frame to Veo.
 *
 * This is where the money goes, so this is where the allowance is checked. The
 * whole reel is reserved at once rather than scene by scene — stopping halfway
 * would leave someone with an unfinishable video and no allowance left to
 * finish it.
 */
multiframeRouter.post(
  '/:id/videos',
  requireFeature('multiframe'),
  wrap(async (req, res) => {
    const { reel, scenes } = await load(req)

    if (reel.status === 'rendering') throw new ApiError(409, 'already_rendering', 'This reel is already being filmed.')
    if (reel.status !== 'frames_ready') {
      throw new ApiError(409, 'not_ready_to_film', 'This reel has no finished frames waiting to be filmed.')
    }

    // Only scenes that actually have a still. A frame that failed has nothing
    // to drive a clip from, and paying for one would buy a black video.
    const filmable = scenes.filter((sc) => sc.frame_path && sc.status === 'frame_ready')
    if (!filmable.length) throw new ApiError(409, 'no_frames', 'None of this reel\'s frames finished.')

    const used = await usedThisMonth(req.user.id)
    const remaining = Math.max(0, MONTHLY_LIMIT - used)
    if (remaining < filmable.length) {
      throw new ApiError(
        429,
        'monthly_limit_reached',
        remaining === 0
          ? `You have used all ${MONTHLY_LIMIT} videos included this month. It resets on the 1st.`
          : `Filming ${filmable.length} scenes costs ${filmable.length} of your ${MONTHLY_LIMIT} monthly videos, and you have ${remaining} left.`
      )
    }

    await admin.from('multiframes').update({ status: 'rendering', error: null }).eq('id', reel.id)

    const options = {
      duration: reel.duration_seconds,
      aspectRatio: reel.aspect_ratio,
      resolution: reel.resolution,
      negativePrompt: VIDEO_NEGATIVE,
    }
    const hasProduct = Boolean(reel.product_path)

    await Promise.all(
      filmable.map(async (sc) => {
        try {
          const imageUrl = await signedUrl(sc.frame_path)
          const { operationName } = await startSceneGeneration({
            prompt: motionPrompt({ motion: sc.motion_prompt }, { hasProduct }),
            imageUrl,
            options,
          })

          await admin.from('generation_events').insert({
            user_id: req.user.id,
            kind: CREDIT_KIND,
            cost_units: 1,
            meta: {
              multiframe_id: reel.id,
              scene_idx: sc.idx,
              duration: options.duration,
              resolution: options.resolution,
              aspect_ratio: options.aspectRatio,
            },
          })

          await admin
            .from('multiframe_scenes')
            .update({ status: 'rendering', operation_name: operationName, error: null })
            .eq('id', sc.id)
        } catch (err) {
          console.warn(`[multiframe] ${reel.id} scene ${sc.idx} could not start:`, err?.message || err)
          await admin
            .from('multiframe_scenes')
            .update({ status: 'failed', error: String(err?.message || err).slice(0, 300) })
            .eq('id', sc.id)
        }
      })
    )

    res.status(202).json({ multiframeId: reel.id, status: 'rendering', filming: filmable.length })
  })
)

/**
 * Redraw one frame, as a re-roll or as an edit.
 *
 * Only while the reel is resting at frames_ready. Once filming has started the
 * clip is driven from the frame that existed at that moment, so changing the
 * picture afterwards would leave the two disagreeing with no way to tell from
 * the UI which one the video came from.
 */
multiframeRouter.post(
  '/:id/frames/:idx',
  requireFeature('multiframe'),
  wrap(async (req, res) => {
    const { reel, scenes } = await load(req)

    if (reel.status !== 'frames_ready') {
      throw new ApiError(409, 'frames_locked', 'Frames can only be changed before the reel is filmed.')
    }

    const idx = Number(req.params.idx)
    const scene = scenes.find((sc) => sc.idx === idx)
    if (!scene) throw notFound('That scene does not exist.')

    if (scene.frame_revisions >= MAX_FRAME_REVISIONS) {
      throw new ApiError(
        429,
        'too_many_revisions',
        `You have redrawn this frame ${MAX_FRAME_REVISIONS} times. Start a new reel if it still is not right.`
      )
    }

    const instruction = String(req.body?.instruction || '').trim().slice(0, 400)
    const establishing = scenes.find((sc) => sc.idx === 0) || scene

    await admin.from('multiframe_scenes').update({ status: 'framing' }).eq('id', scene.id)

    try {
      const [establishingUrl, currentUrl, productUrl] = await Promise.all([
        signedUrl(establishing.frame_path),
        signedUrl(scene.frame_path),
        signedUrl(reel.product_path),
      ])

      const url = await redrawFrame({
        scene,
        establishingUrl,
        currentUrl,
        productUrl,
        instruction,
        aspectRatio: reel.aspect_ratio,
      })

      const { buffer, contentType } = await download(url)
      // A new path rather than overwriting: the browser is holding a signed URL
      // for the old file, and an upsert to the same key hands back a picture the
      // cache may or may not have replaced. A new key is unambiguously new.
      const path = `${reel.user_id}/multiframes/${reel.id}/${String(idx).padStart(2, '0')}-frame-r${scene.frame_revisions + 1}.png`

      const { error: upErr } = await admin.storage
        .from('generations')
        .upload(path, buffer, { contentType, upsert: true })
      if (upErr) throw new Error(upErr.message)

      const previous = scene.frame_path
      await admin
        .from('multiframe_scenes')
        .update({
          status: 'frame_ready',
          frame_path: path,
          error: null,
          frame_revisions: scene.frame_revisions + 1,
        })
        .eq('id', scene.id)

      // Only once the row points at the new file, so a failure above never
      // leaves the scene referencing something that has been deleted.
      if (previous) await admin.storage.from('generations').remove([previous]).catch(() => {})

      res.json({ idx, status: 'frame_ready', frameUrl: await signedUrl(path), revisions: scene.frame_revisions + 1 })
    } catch (err) {
      await admin
        .from('multiframe_scenes')
        .update({ status: 'frame_ready', error: String(err?.message || err).slice(0, 300) })
        .eq('id', scene.id)
      throw err
    }
  })
)

/** The reel and its scenes, scoped to the caller. */
async function load(req) {
  const { data: reel } = await admin
    .from('multiframes')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!reel) throw notFound('That reel does not exist.')

  const { data: scenes } = await admin
    .from('multiframe_scenes')
    .select('*')
    .eq('multiframe_id', reel.id)
    .order('idx', { ascending: true })

  return { reel, scenes: scenes || [] }
}

/**
 * Poll a reel. The browser calls this every few seconds.
 *
 * Not gated on the feature, for the reason /api/veo/status is not: a reel
 * already started and paid for stays collectable if the plan lapses mid-render.
 * Scoped to the caller's own rows, which is what keeps that from being a way
 * around the gate.
 */
multiframeRouter.get(
  '/status/:id',
  wrap(async (req, res) => {
    const { data: reel } = await admin
      .from('multiframes')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (!reel) throw notFound('That reel does not exist.')

    const { data: scenes } = await admin
      .from('multiframe_scenes')
      .select('*')
      .eq('multiframe_id', reel.id)
      .order('idx', { ascending: true })

    const rows = scenes || []

    // Collect the clips that finished since the last poll. Concurrent, and each
    // one guarded on its own — a scene whose download fails must not stop the
    // others being banked.
    await Promise.all(rows.map((s) => collect(s).catch(() => {})))

    const { data: fresh } = await admin
      .from('multiframe_scenes')
      .select('*')
      .eq('multiframe_id', reel.id)
      .order('idx', { ascending: true })

    const settled = await settle(reel, fresh || [])

    res.json({
      multiframeId: reel.id,
      name: reel.name,
      idea: reel.idea,
      script: reel.script,
      status: settled.status,
      error: settled.error,
      aspectRatio: reel.aspect_ratio,
      durationSeconds: reel.duration_seconds,
      ready: (fresh || []).filter((s) => s.status === 'ready').length,
      framesReady: (fresh || []).filter((s) => s.frame_path).length,
      total: reel.scene_count,
      hasProduct: Boolean(reel.product_path),
      maxFrameRevisions: MAX_FRAME_REVISIONS,
      scenes: await Promise.all(
        (fresh || []).map(async (s) => ({
          idx: s.idx,
          description: s.description,
          status: s.status,
          error: s.error,
          revisions: s.frame_revisions ?? 0,
          frameUrl: await signedUrl(s.frame_path),
          videoUrl: await signedUrl(s.video_path),
        }))
      ),
    })
  })
)

/** One scene: poll fal, and archive the clip if it is done. */
async function collect(scene) {
  if (scene.status !== 'rendering' || !scene.operation_name) return

  try {
    const { done, videoUri } = await pollOperation(scene.operation_name)
    if (!done) return

    const path = `${scene.user_id}/multiframes/${scene.multiframe_id}/${String(scene.idx).padStart(2, '0')}.mp4`
    const { buffer, contentType } = await downloadVideo(videoUri)

    const { error: upErr } = await admin.storage
      .from('generations')
      .upload(path, buffer, { contentType, upsert: true })
    if (upErr) throw new Error(`could not archive the scene: ${upErr.message}`)

    await admin
      .from('multiframe_scenes')
      .update({ status: 'ready', video_path: path, error: null })
      .eq('id', scene.id)
  } catch (err) {
    await admin
      .from('multiframe_scenes')
      .update({ status: 'failed', error: String(err?.message || err).slice(0, 300) })
      .eq('id', scene.id)
  }
}

/**
 * Decide whether the reel is finished, and say so on the row.
 *
 * A reel with one dead scene is still a reel. The clips that rendered are paid
 * for and watchable, and the browser can play and export the ones it has, so a
 * partial result resolves to 'ready' with the shortfall named in `error` rather
 * than to 'failed' — which would discard work somebody was charged for. Only a
 * reel where nothing survived is a failure.
 */
async function settle(reel, scenes) {
  if (reel.status === 'ready' || reel.status === 'failed') {
    return { status: reel.status, error: reel.error }
  }
  // Only a reel that is actually filming can finish filming. Without this, a
  // reel resting at frames_ready whose frames had all failed would settle
  // itself straight to 'failed' — and, worse, one whose frames were all drawn
  // could be read as finished before a single clip had been paid for.
  if (reel.status !== 'rendering') return { status: reel.status, error: reel.error }
  // Scenes are inserted after the plan returns, so an empty set here means the
  // split has not finished yet — not that every scene vanished.
  if (!scenes.length) return { status: reel.status, error: reel.error }

  const terminal = scenes.filter((s) => s.status === 'ready' || s.status === 'failed')
  if (terminal.length < reel.scene_count) return { status: reel.status, error: reel.error }

  const ok = scenes.filter((s) => s.status === 'ready').length
  const lost = reel.scene_count - ok

  const next = ok === 0
    ? { status: 'failed', error: scenes.find((s) => s.error)?.error || 'No scenes could be rendered.' }
    : {
        status: 'ready',
        error: lost > 0 ? `${lost} of ${reel.scene_count} scenes could not be rendered.` : null,
      }

  await admin.from('multiframes').update(next).eq('id', reel.id)
  return next
}

async function signedUrl(path) {
  if (!path) return null
  const { data, error } = await admin.storage.from('generations').createSignedUrl(path, SIGNED_URL_TTL)
  if (error) {
    console.warn(`[multiframe] could not sign ${path}: ${error.message}`)
    return null
  }
  return data.signedUrl
}

/** Split a validated image data URL into the bytes and mime storage wants. */
function decodeToBytes(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  return { bytes: Buffer.from(m[2], 'base64'), contentType: m[1] }
}

/**
 * The generations bucket accepts png, jpeg and webp and nothing else, so a
 * format it does not take has to be refused here rather than three seconds
 * later as an opaque storage error.
 *
 * This is not hypothetical: an iPhone photo is HEIC, `accept="image/*"` lets
 * the picker return it, and Safari uploads it unconverted. decodeProductImage
 * passes it happily — it only checks that the thing is an image — and the
 * upload is what fails, after the row exists.
 */
// Exactly the bucket's allowed_mime_types. 'image/jpg' is deliberately absent:
// it is not a real media type, no browser emits it, and allowing it here would
// only let a request past this check to fail at the upload instead.
const STORABLE = new Set(['image/png', 'image/jpeg', 'image/webp'])

function assertStorableImage(dataUrl) {
  if (!dataUrl) return
  const mime = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(dataUrl)?.[1]?.toLowerCase()
  if (!STORABLE.has(mime)) {
    throw badRequest(
      `That image is ${mime || 'an unsupported format'}. Save it as JPEG, PNG or WebP and try again — ` +
        `photos straight off an iPhone are often HEIC, which we cannot store.`
    )
  }
}

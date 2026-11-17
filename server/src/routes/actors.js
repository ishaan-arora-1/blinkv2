import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, badRequest, notFound, ApiError } from '../middleware/errors.js'
import { download } from '../fal.js'
import { decodeProductImage, fetchCreatorImage, submitQueued, pollOperation, downloadVideo } from '../video.js'
import { VOICES, voiceById, synthesize, downloadAudio } from '../voice.js'
import { CREDIT_KIND, usedThisMonth, usage } from '../blinkCredits.js'
import { allowanceFor } from '../entitlements.js'
import {
  ACTORS,
  CUSTOM_ACTOR,
  SCRIPT,
  MAX_SECONDS,
  AVATAR_PROMPT,
  actorById,
  validateScript,
  estimateSeconds,
  composeWithProduct,
  avatarConfigured,
} from '../actors.js'

// requireAuth is applied where this router is mounted.
export const actorsRouter = Router()

const SIGNED_URL_TTL = 60 * 60
const BUCKET = 'generations'

// Two takes at once. An actor video is one job, not six, so this can be looser
// than Blink AI's one-reel cap — and comparing two actors reading the same
// script side by side is exactly how people use this.
const MAX_IN_FLIGHT = 2
const IN_FLIGHT = ['voicing', 'composing', 'rendering']

// Exactly the generations bucket's image types; see assertStorableImage in
// routes/multiframe.js for why HEIC has to be refused up here.
const STORABLE = new Set(['image/png', 'image/jpeg', 'image/webp'])

function toBytes(dataUrl, what) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || '')
  if (!m) throw badRequest(`That ${what} is not an image we can read.`)
  const contentType = m[1].toLowerCase()
  if (!STORABLE.has(contentType)) {
    throw badRequest(`That ${what} is ${contentType}. Save it as JPEG, PNG or WebP — iPhone photos are often HEIC.`)
  }
  return { bytes: Buffer.from(m[2], 'base64'), contentType }
}

async function put(path, bytes, contentType) {
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
  if (error) throw new Error(`could not store ${path.split('/').pop()}: ${error.message}`)
  return path
}

async function sign(path) {
  if (!path) return null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) {
    console.warn(`[actors] could not sign ${path}: ${error.message}`)
    return null
  }
  return data.signedUrl
}

function fmt(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const r = Math.round(seconds % 60)
  return r ? `${m}m ${r}s` : `${m} minute${m === 1 ? '' : 's'}`
}

async function present(row) {
  const [videoUrl, faceUrl] = await Promise.all([sign(row.storage_path), sign(row.face_path)])
  const actor = actorById(row.actor_id)
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    // Roster stills are public files; a custom face only exists signed.
    actorImg: actor?.img || faceUrl,
    script: row.script,
    voice: row.voice,
    status: row.status,
    error: row.status === 'failed' ? row.error : null,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
    videoUrl,
    faceUrl,
    hasProduct: Boolean(row.product_path),
    createdAt: row.created_at,
  }
}

async function fail(id, err) {
  console.error(`[actors] ${id} failed:`, err?.message || err)
  await admin
    .from('actor_videos')
    .update({ status: 'failed', error: String(err?.message || err).slice(0, 500), operation_name: null })
    .eq('id', id)
}

actorsRouter.get('/options', (_req, res) =>
  res.json({ actors: ACTORS, voices: VOICES, script: SCRIPT, maxSeconds: MAX_SECONDS })
)

actorsRouter.get(
  '/usage',
  requireFeature('actors'),
  wrap(async (req, res) => res.json(await usage(req.user.id, req.entitlement.paidTier)))
)

actorsRouter.get(
  '/',
  requireFeature('actors'),
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from('actor_videos')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) throw new Error(error.message)
    res.json({ videos: await Promise.all((data || []).map(present)) })
  })
)

/**
 * Start a take.
 *
 * Answers as soon as the row exists, then voices it, optionally puts the
 * product in the actor's hand, and hands it to the avatar model — storing the
 * status URL, so the wait belongs to whoever polls /:id rather than to a
 * background task that a redeploy would kill.
 */
actorsRouter.post(
  '/generate',
  requireFeature('actors'),
  wrap(async (req, res) => {
    if (!avatarConfigured()) {
      throw new ApiError(503, 'generation_not_configured', 'AI Actors is not set up on this server yet.')
    }

    const script = validateScript(req.body?.script)
    const voice = voiceById(req.body?.voice)?.id
    if (!voice) throw badRequest('Pick a voice.')

    const actorId = String(req.body?.actorId || '')
    const custom = actorId === CUSTOM_ACTOR
    const actor = custom ? null : actorById(actorId)
    if (!custom && !actor) throw badRequest('Pick an actor.')

    let face = null
    if (custom) {
      if (req.body?.consent !== true) {
        throw badRequest('Confirm that this is you, or that you have permission to use this person’s likeness.')
      }
      face = toBytes(decodeProductImage(req.body?.faceImage), 'photo')
    }
    const productImage = req.body?.productImage ? decodeProductImage(req.body.productImage) : null
    const product = productImage ? toBytes(productImage, 'product photo') : null

    const { count: inFlight } = await admin
      .from('actor_videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', IN_FLIGHT)
    if ((inFlight ?? 0) >= MAX_IN_FLIGHT) {
      throw new ApiError(429, 'too_many_in_flight', `You already have ${MAX_IN_FLIGHT} takes rendering. Let one finish first.`)
    }

    // Checked against the estimate before anything is spent. The narration is
    // the first paid step, and someone who cannot afford the video should hear
    // so before paying for the voice.
    const wanted = estimateSeconds(script)
    const used = await usedThisMonth(req.user.id)
    const limit = allowanceFor(req.entitlement.paidTier).videoSeconds
    const remaining = Math.max(0, limit - used)
    if (remaining < wanted) {
      throw new ApiError(
        429,
        'monthly_limit_reached',
        remaining === 0
          ? `You have used all ${fmt(limit)} of video included this month. It resets on the 1st.`
          : `That script is about ${fmt(wanted)} spoken and you have ${fmt(remaining)} left this month. Trim it a little.`
      )
    }

    const brandId = req.body?.brandId ? String(req.body.brandId) : null
    if (brandId) {
      const { data: b } = await admin.from('brands').select('id').eq('user_id', req.user.id).eq('id', brandId).maybeSingle()
      if (!b) throw notFound('That brand is not on your account.')
    }

    const { data: row, error } = await admin
      .from('actor_videos')
      .insert({
        user_id: req.user.id,
        brand_id: brandId,
        actor_id: custom ? CUSTOM_ACTOR : actor.id,
        actor_name: custom ? 'You' : actor.name,
        script,
        voice,
        status: 'voicing',
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    build({ row, actor, face, product, userId: req.user.id }).catch((err) => fail(row.id, err))

    res.status(201).json({ video: await present(row) })
  })
)

async function build({ row, actor, face, product, userId }) {
  const base = `${userId}/actors/${row.id}`

  // 1 · the face, in our own storage, so the vendor reads a short signed URL
  //     rather than a megabyte of base64 — and so a custom face is ours to
  //     delete when the take is.
  let facePath
  if (face) {
    facePath = await put(`${base}/face`, face.bytes, face.contentType)
  } else {
    const dataUrl = await fetchCreatorImage(actor.id)
    const { bytes, contentType } = toBytes(dataUrl, 'actor still')
    facePath = await put(`${base}/face`, bytes, contentType)
  }
  let faceUrl = await sign(facePath)
  await admin.from('actor_videos').update({ face_path: facePath }).eq('id', row.id)

  // 2 · voice and composition run together; neither needs the other.
  const voicing = synthesize({ script: row.script, voice: row.voice })

  let composing = null
  if (product) {
    const productPath = await put(`${base}/product`, product.bytes, product.contentType)
    await admin.from('actor_videos').update({ product_path: productPath, status: 'composing' }).eq('id', row.id)
    composing = (async () => {
      let url
      try {
        url = await composeWithProduct(faceUrl, await sign(productPath))
      } catch (err) {
        // fal's own wording talks about carousels; this is a product photo.
        if (err?.code === 'content_rejected') {
          throw new Error('The image model refused that product photo. Try a plain packshot on a clean background. Nothing was charged.')
        }
        throw err
      }
      const { buffer, contentType } = await download(url)
      const composedPath = await put(`${base}/face-with-product`, buffer, contentType)
      await admin.from('actor_videos').update({ face_path: composedPath }).eq('id', row.id)
      return sign(composedPath)
    })()
  }

  const narration = await voicing
  const { buffer: audio, contentType: audioType } = await downloadAudio(narration.audioUrl)
  const audioPath = await put(`${base}/voice.mp3`, audio, audioType)

  if (composing) faceUrl = await composing

  const seconds = Math.ceil(narration.duration || estimateSeconds(row.script))

  // 3 · the take.
  const { operationName } = await submitQueued(env.fal.avatarModel, {
    image_url: faceUrl,
    audio_url: await sign(audioPath),
    prompt: AVATAR_PROMPT,
  })

  // Charged once the vendor has accepted the job — not before, so a take that
  // never started costs nothing; not after, so one that is abandoned mid-render
  // still counts what it cost us.
  await admin.from('generation_events').insert({
    user_id: userId,
    kind: CREDIT_KIND,
    cost_units: seconds,
    meta: { actor_video_id: row.id, actor: row.actor_id, feature: 'actors' },
  })

  await admin
    .from('actor_videos')
    .update({ audio_path: audioPath, operation_name: operationName, duration_seconds: seconds, status: 'rendering' })
    .eq('id', row.id)
}

/** One poll. Collects the finished video into our storage the first time it is seen. */
actorsRouter.get(
  '/:id',
  requireFeature('actors'),
  wrap(async (req, res) => {
    const { data: row } = await admin
      .from('actor_videos')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle()
    if (!row) throw notFound('That take is not on your account.')

    if (row.status === 'rendering' && row.operation_name) {
      try {
        const { done, videoUri } = await pollOperation(row.operation_name)
        if (done) {
          const { buffer, contentType } = await downloadVideo(videoUri)
          const path = await put(`${req.user.id}/actors/${row.id}/take.mp4`, buffer, contentType)
          const { data: updated } = await admin
            .from('actor_videos')
            .update({ storage_path: path, status: 'ready', operation_name: null })
            .eq('id', row.id)
            .select('*')
            .single()
          return res.json({ video: await present(updated) })
        }
      } catch (err) {
        // A vendor that says FAILED is final; a network blip on our side is
        // not, and the next poll will try again.
        if (err instanceof ApiError && err.code === 'generation_failed') {
          await fail(row.id, err)
          return res.json({ video: await present({ ...row, status: 'failed', error: err.message }) })
        }
        console.warn(`[actors] poll ${row.id}: ${err.message}`)
      }
    }

    // A take stuck in voicing/composing for ten minutes lost its background
    // task to a restart. Say so, rather than spinning forever.
    if (['voicing', 'composing'].includes(row.status) && Date.now() - new Date(row.updated_at).getTime() > 10 * 60_000) {
      await fail(row.id, new Error('This take was interrupted before it started filming. Nothing was charged — try again.'))
      return res.json({ video: await present({ ...row, status: 'failed', error: 'This take was interrupted before it started filming. Nothing was charged — try again.' }) })
    }

    res.json({ video: await present(row) })
  })
)

actorsRouter.delete(
  '/:id',
  requireFeature('actors'),
  wrap(async (req, res) => {
    const { data: row } = await admin
      .from('actor_videos')
      .select('id, face_path, product_path, audio_path, storage_path')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle()
    if (!row) throw notFound('That take is not on your account.')

    const base = `${req.user.id}/actors/${row.id}`
    await admin.storage
      .from(BUCKET)
      .remove([`${base}/face`, `${base}/face-with-product`, `${base}/product`, `${base}/voice.mp3`, `${base}/take.mp4`])
    await admin.from('actor_videos').delete().eq('id', row.id)
    res.status(204).end()
  })
)

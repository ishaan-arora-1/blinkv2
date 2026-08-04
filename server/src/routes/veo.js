import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, badRequest, notFound, ApiError } from '../middleware/errors.js'
import {
  LIMITS,
  decodeProductImage,
  fetchCreatorImage,
  validateOptions,
  startGeneration,
  pollOperation,
  downloadVideo,
} from '../veo.js'

// requireAuth is applied where this router is mounted, so the rate limiter can
// key on req.user. Every route below can assume req.user exists.
export const veoRouter = Router()

const SIGNED_URL_TTL = 60 * 60 // 1 hour
const MAX_IN_FLIGHT = 3

veoRouter.get('/limits', (_req, res) => res.json({ limits: LIMITS }))

/**
 * Start a generation.
 *
 * Requires the Studio tier, checked server-side. The Google key lives only in
 * this process — a generation is the one thing here that costs real money, so
 * it is the one thing the browser is never trusted to initiate directly.
 */
veoRouter.post(
  '/generate',
  requireFeature('blink'),
  wrap(async (req, res) => {
    if (!env.google.configured) {
      throw new ApiError(
        503,
        'generation_not_configured',
        'Video generation is not set up on this server yet.'
      )
    }

    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) throw badRequest('Describe the video you want.')
    if (prompt.length > 2000) throw badRequest('Keep the prompt under 2000 characters.')

    const options = validateOptions(req.body)
    const creatorId = req.body?.creatorId ? String(req.body.creatorId) : null

    // Rendering is slow and expensive. Cap what one account can have running.
    const { count } = await admin
      .from('blinks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', ['pending', 'rendering'])

    if ((count ?? 0) >= MAX_IN_FLIGHT) {
      throw new ApiError(
        429,
        'too_many_in_flight',
        `You already have ${count} generations rendering. Wait for one to finish.`
      )
    }

    // Record the intent before spending anything, so a generation is always
    // accounted for even if the call to Veo fails.
    const { data: blink, error: insertError } = await admin
      .from('blinks')
      .insert({
        user_id: req.user.id,
        prompt,
        creator_id: creatorId,
        creator_name: req.body?.creatorName ? String(req.body.creatorName).slice(0, 80) : null,
        duration_seconds: options.duration,
        aspect_ratio: options.aspectRatio,
        resolution: options.resolution,
        negative_prompt: options.negativePrompt || null,
        status: 'pending',
      })
      .select('*')
      .single()

    if (insertError) throw new Error(insertError.message)

    try {
      const [creatorImage, productImage] = await Promise.all([
        fetchCreatorImage(creatorId),
        Promise.resolve(decodeProductImage(req.body?.productImage)),
      ])

      const { operationName, videoUri } = await startGeneration({
        prompt,
        creatorImage,
        productImage,
        options,
      })

      await admin.from('generation_events').insert({
        user_id: req.user.id,
        kind: 'blink.generate',
        cost_units: 1,
        meta: {
          blink_id: blink.id,
          duration: options.duration,
          resolution: options.resolution,
          aspect_ratio: options.aspectRatio,
        },
      })

      // Rare path: the response came back inline rather than as an operation.
      if (!operationName && videoUri) {
        const finished = await finalize(blink, videoUri)
        return res.status(201).json(finished)
      }

      await admin
        .from('blinks')
        .update({ status: 'rendering', operation_name: operationName })
        .eq('id', blink.id)

      res.status(201).json({ blinkId: blink.id, status: 'rendering', url: null })
    } catch (err) {
      await admin
        .from('blinks')
        .update({ status: 'failed', error: String(err?.message || err).slice(0, 500) })
        .eq('id', blink.id)
      throw err
    }
  })
)

/**
 * Poll a generation. The browser calls this every few seconds.
 *
 * Deliberately not gated on the Growth tier: a generation already started and
 * paid for should still be collectable if the plan lapses mid-render. Scoped to
 * the caller's own rows, which is what keeps it from being a way around the gate.
 */
veoRouter.get(
  '/status/:blinkId',
  wrap(async (req, res) => {
    const { data: blink } = await admin
      .from('blinks')
      .select('*')
      .eq('id', req.params.blinkId)
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (!blink) throw notFound('That generation does not exist.')

    if (blink.status === 'ready') {
      return res.json({ blinkId: blink.id, status: 'ready', url: await signedUrl(blink.storage_path) })
    }
    if (blink.status === 'failed') {
      return res.json({ blinkId: blink.id, status: 'failed', error: blink.error, url: null })
    }
    if (!blink.operation_name) {
      return res.json({ blinkId: blink.id, status: blink.status, url: null })
    }

    try {
      const { done, videoUri } = await pollOperation(blink.operation_name)
      if (!done) return res.json({ blinkId: blink.id, status: 'rendering', url: null })

      const finished = await finalize(blink, videoUri)
      res.json(finished)
    } catch (err) {
      await admin
        .from('blinks')
        .update({ status: 'failed', error: String(err?.message || err).slice(0, 500) })
        .eq('id', blink.id)
      throw err
    }
  })
)

/**
 * Pull the finished render off Google's temporary URI and into our own storage.
 *
 * Veo's file URIs expire and are only reachable with the API key appended, so
 * handing one to the browser would either break within the hour or leak the
 * key. Copying it once here does both jobs.
 */
async function finalize(blink, videoUri) {
  const path = `${blink.user_id}/blinks/${blink.id}.mp4`
  const { buffer, contentType } = await downloadVideo(videoUri)

  const { error: uploadError } = await admin.storage
    .from('generations')
    .upload(path, buffer, { contentType, upsert: true })

  if (uploadError) throw new Error(`could not archive the generation: ${uploadError.message}`)

  await admin
    .from('blinks')
    .update({ status: 'ready', storage_path: path, error: null })
    .eq('id', blink.id)

  return { blinkId: blink.id, status: 'ready', url: await signedUrl(path) }
}

async function signedUrl(path) {
  if (!path) return null
  const { data, error } = await admin.storage.from('generations').createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw new Error(`could not sign the video URL: ${error.message}`)
  return data.signedUrl
}

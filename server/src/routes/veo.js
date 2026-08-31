import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { requireFeature } from '../middleware/auth.js'
import { wrap, badRequest, notFound, ApiError } from '../middleware/errors.js'
import { LIMITS, pollOperation, downloadVideo } from '../video.js'


// requireAuth is applied where this router is mounted, so the rate limiter can
// key on req.user. Every route below can assume req.user exists.
export const veoRouter = Router()

const SIGNED_URL_TTL = 60 * 60 // 1 hour
const MAX_IN_FLIGHT = 3

veoRouter.get('/limits', (_req, res) => res.json({ limits: LIMITS }))

/**
 * The single-clip generator is closed.
 *
 * This route made one eight-second Veo clip and had its own page; Blink AI now
 * means a multi-scene reel and that page is gone. The generator is refused
 * rather than deleted for one reason: /status below still has to work, because
 * three finished clips exist on real accounts and their owners can still play
 * and download them from the library.
 *
 * Refusing here also closes an unmetered hole. This path spent money at the
 * vendor against the old clip-denominated cap, which no longer exists — left
 * open, it would bill with nothing counting it.
 */
veoRouter.post('/generate', (_req, res) =>
  res.status(410).json({
    error: {
      code: 'gone',
      message:
        'Single-clip generation has been replaced by Blink AI, which makes multi-scene videos. Your existing clips are still in your library.',
    },
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

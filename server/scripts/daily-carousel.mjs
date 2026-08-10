/**
 * Generates one marketing carousel and posts it to Instagram.
 *
 *   node scripts/daily-carousel.mjs            # dry run — writes PNGs, posts nothing
 *   node scripts/daily-carousel.mjs --publish  # actually posts
 *   node scripts/daily-carousel.mjs --init     # seed the token store, then exit
 *
 * Dry run is the default on purpose. The copy is written by a model every
 * morning and nobody reads it before it goes out; the first week is when you
 * find out what it does with an angle you did not anticipate. Look at a few
 * days of output, then add the flag.
 *
 * What a run costs: one LLM call. The backgrounds are CSS gradients rendered by
 * headless Chrome, so no image model is billed — see carouselArt.js.
 *
 * ── Setup ──────────────────────────────────────────────────────────────────
 * The token lives in server/.instagram.json, not in the environment, because a
 * refresh replaces it and a process cannot rewrite its own env. Seed it once:
 *
 *   INSTAGRAM_ACCESS_TOKEN=<long-lived token> node scripts/daily-carousel.mjs --init
 *
 * Everything else comes from the usual server env (SUPABASE_*, FAL_KEY) plus:
 *
 *   INSTAGRAM_POST_USER_ID   the Supabase user id whose storage the PNGs land in
 *   INSTAGRAM_APP_SECRET     optional; only needed to exchange a short-lived token
 *   CHROME_BIN               optional; defaults to the macOS Chrome path
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

import { admin } from '../src/supabase.js'
import { generateCarouselCopy, copyFromJson, buildCaption } from '../src/carouselCopy.js'
import { renderSlides } from '../src/carouselArt.js'
import {
  me,
  refreshToken,
  exchangeToken,
  createItemContainer,
  createCarouselContainer,
  waitForContainer,
  publishContainer,
  publishingLimit,
  InstagramError,
} from '../src/instagram.js'

const ROOT = new URL('..', import.meta.url).pathname
const STATE_PATH = join(ROOT, '.instagram.json')
const OUT_DIR = join(ROOT, 'tmp', 'carousels')

const BUCKET = 'generations'
// Meta fetches the media itself, once, shortly after the container is created.
// A day of validity is far more than that needs and leaves room for a retry.
const SIGNED_TTL_S = 24 * 60 * 60
// Refresh well before the 60-day cliff. An expired token cannot be refreshed at
// all — only re-authorised by a person — so the margin is worth the extra call.
const REFRESH_WHEN_DAYS_LEFT = 20

const PUBLISH = process.argv.includes('--publish')
const INIT = process.argv.includes('--init')
const FORCE = process.argv.includes('--force')
// --copy <file.json> posts a hand-written carousel instead of generating one.
// Same render, same upload, same publish — only the words come from elsewhere,
// and no vendor is called at all.
const COPY_FILE = (() => {
  const i = process.argv.indexOf('--copy')
  return i !== -1 ? process.argv[i + 1] : null
})()

const log = (...a) => console.log(...a)
const fail = (msg) => {
  console.error(`\n  ✗ ${msg}\n`)
  process.exit(1)
}

// ── token store ────────────────────────────────────────────────────────────
// 0600 because this file is a credential: it can post to the account and, for
// its lifetime, is as good as the password.

function readState() {
  if (!existsSync(STATE_PATH)) return null
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch (err) {
    fail(`${STATE_PATH} is not valid JSON (${err.message}). Re-run with --init.`)
  }
}

function writeState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 })
  chmodSync(STATE_PATH, 0o600)
}

async function init() {
  const token = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim()
  if (!token) fail('Set INSTAGRAM_ACCESS_TOKEN in the environment and re-run with --init.')

  let accessToken = token
  let expiresIn = 60 * 24 * 60 * 60

  const secret = (process.env.INSTAGRAM_APP_SECRET || '').trim()
  if (secret) {
    try {
      const ex = await exchangeToken(token, secret)
      accessToken = ex.accessToken
      expiresIn = ex.expiresIn || expiresIn
      log('  ✓ exchanged a short-lived token for a long-lived one')
    } catch (err) {
      // A token that is already long-lived is rejected by this endpoint, and
      // that is the normal case for one generated from the App Dashboard. It is
      // not a reason to refuse to set up.
      log(`  · exchange declined (${err.message}) — treating the token as already long-lived`)
    }
  }

  const who = await me(accessToken).catch((err) =>
    fail(`Instagram rejected the token: ${err.message}`)
  )

  writeState({
    accessToken,
    igUserId: who.user_id,
    username: who.username,
    obtainedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    lastPost: null,
  })

  log(`\n  ✓ connected @${who.username} (${who.account_type || 'unknown type'})`)
  log(`    token stored in ${STATE_PATH}, 0600`)
  log(`    expires ${new Date(Date.now() + expiresIn * 1000).toDateString()}\n`)
}

/** Refresh when the clock is getting short. Each refresh resets 60 days from now. */
async function maybeRefresh(state) {
  const ageH = (Date.now() - new Date(state.obtainedAt).getTime()) / 3_600_000
  const daysLeft = (new Date(state.expiresAt).getTime() - Date.now()) / 86_400_000

  // Meta rejects a refresh on a token under 24 hours old.
  if (ageH < 25 || daysLeft > REFRESH_WHEN_DAYS_LEFT) return state

  try {
    const { accessToken, expiresIn } = await refreshToken(state.accessToken)
    const next = {
      ...state,
      accessToken,
      obtainedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (expiresIn || 60 * 86_400) * 1000).toISOString(),
    }
    writeState(next)
    log(`  ✓ token refreshed — good until ${new Date(next.expiresAt).toDateString()}`)
    return next
  } catch (err) {
    // Not fatal on its own: the current token may still have days on it. Loud,
    // because the day it does become fatal a person has to re-authorise by hand.
    console.error(`  ⚠ token refresh failed: ${err.message}`)
    console.error(`    ${Math.round(daysLeft)} days left. Re-authorise before it hits zero.`)
    return state
  }
}

// ── upload ─────────────────────────────────────────────────────────────────

async function uploadSlides(buffers, userId, stamp) {
  const urls = []
  for (let i = 0; i < buffers.length; i++) {
    // First path segment is the owner's uid, matching every policy in
    // 0003_storage.sql. The service role bypasses RLS but the convention is
    // what makes the object findable and deletable later.
    const path = `${userId}/instagram/${stamp}/slide-${i + 1}.png`

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffers[i], { contentType: 'image/png', upsert: true })
    if (upErr) throw new Error(`Upload of slide ${i + 1} failed: ${upErr.message}`)

    const { data, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL_S)
    if (signErr || !data?.signedUrl) {
      throw new Error(`Could not sign slide ${i + 1}: ${signErr?.message || 'no url'}`)
    }
    urls.push(data.signedUrl)
    log(`    ${i + 1}/${buffers.length} uploaded`)
  }
  return urls
}

// ── publish ────────────────────────────────────────────────────────────────

async function publish({ state, imageUrls, caption }) {
  const { igUserId, accessToken: token } = state

  try {
    const { used, quota } = await publishingLimit({ igUserId, token })
    log(`  · publishing quota: ${used ?? '?'} of ${quota} used in the last 24h`)
    if (used !== null && used >= quota) {
      throw new Error(`Instagram's 24-hour publishing limit is used up (${used}/${quota}).`)
    }
  } catch (err) {
    if (err instanceof InstagramError) log(`  · could not read quota (${err.message}) — continuing`)
    else throw err
  }

  log('  · creating item containers')
  const children = []
  for (let i = 0; i < imageUrls.length; i++) {
    children.push(await createItemContainer({ igUserId, imageUrl: imageUrls[i], token }))
    log(`    ${i + 1}/${imageUrls.length}`)
  }

  log('  · creating the carousel container')
  const carouselId = await createCarouselContainer({ igUserId, children, caption, token })

  log('  · waiting for Instagram to finish processing')
  await waitForContainer({ containerId: carouselId, token })

  log('  · publishing')
  return publishContainer({ igUserId, creationId: carouselId, token })
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  if (INIT) return init()

  const state0 = readState()
  if (!state0) {
    fail(
      `No token store at ${STATE_PATH}.\n` +
        `    Seed it first:  INSTAGRAM_ACCESS_TOKEN=<token> node scripts/daily-carousel.mjs --init`
    )
  }

  const userId = (process.env.INSTAGRAM_POST_USER_ID || '').trim()
  if (PUBLISH && !userId) fail('INSTAGRAM_POST_USER_ID is not set — nowhere to upload the slides.')

  const state = PUBLISH ? await maybeRefresh(state0) : state0
  const stamp = new Date().toISOString().slice(0, 10)

  log(`\n  Blink UGC · daily carousel · ${stamp}${PUBLISH ? '' : '  (DRY RUN)'}`)
  log(`  account: @${state.username}\n`)

  // One post a day, unless told otherwise. The guard exists because a launchd
  // job that fires twice — a reload, a wake-from-sleep — would otherwise put the
  // same carousel up twice, and Instagram is happy to let it.
  if (state.lastPost?.date === stamp && PUBLISH && !FORCE) {
    fail(
      `Already posted today (media ${state.lastPost.mediaId}).\n` +
        `    Pass --force to post a second one anyway.`
    )
  }

  let copy
  if (COPY_FILE) {
    log(`  · reading copy from ${COPY_FILE}`)
    try {
      copy = copyFromJson(JSON.parse(readFileSync(COPY_FILE, 'utf8')))
    } catch (err) {
      fail(`Could not read ${COPY_FILE}: ${err.message}`)
    }
  } else {
    log('  · writing copy')
    copy = await generateCarouselCopy()
  }
  const caption = buildCaption(copy)
  log(`    angle: ${copy.angle}`)
  log(`    hook:  "${copy.hook.headline}"`)
  for (const t of copy.hook.tips) log(`           → ${t.headline}`)

  log('\n  · rendering slides')
  const buffers = await renderSlides(copy.slides)
  log(`    ${buffers.length} slides at 1080×1350`)

  // Always write to disk, publish or not — this is what makes a dry run
  // reviewable, and on a real run it is the record of what actually went out.
  mkdirSync(join(OUT_DIR, stamp), { recursive: true })
  buffers.forEach((b, i) => writeFileSync(join(OUT_DIR, stamp, `slide-${i + 1}.png`), b))
  writeFileSync(join(OUT_DIR, stamp, 'caption.txt'), caption, 'utf8')
  // The exact words this run used, in the shape --copy reads back. Generation is
  // not deterministic, so without this there is no way to publish the set someone
  // just looked at — a second run would quietly produce a different carousel.
  writeFileSync(join(OUT_DIR, stamp, 'copy.json'), JSON.stringify(copy.hook, null, 2), 'utf8')
  log(`    written to ${join(OUT_DIR, stamp)}`)

  if (!PUBLISH) {
    log(`\n  Caption\n  ${'─'.repeat(58)}`)
    log(caption.split('\n').map((l) => `  ${l}`).join('\n'))
    log(`  ${'─'.repeat(58)}`)
    log('\n  Dry run — nothing was posted. Re-run with --publish when it looks right.\n')
    return
  }

  log('\n  · uploading')
  const imageUrls = await uploadSlides(buffers, userId, stamp)

  const mediaId = await publish({ state, imageUrls, caption })

  writeState({ ...state, lastPost: { date: stamp, mediaId, angle: copy.angle } })
  log(`\n  ✓ posted to @${state.username} — media ${mediaId}\n`)
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}`)
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})

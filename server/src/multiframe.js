import { complete, generateFirstSlide, generateSlideFrom } from './fal.js'
import { badRequest, ApiError } from './middleware/errors.js'

/**
 * Multiframe: one idea, several shots.
 *
 * The pipeline is deliberately assembled from parts that already work rather
 * than invented. The scene split and the script come from the same any-llm call
 * animated carousels use for slide copy. The frames come from the same
 * nano-banana pair, with the same trick: shot 1 establishes the look and every
 * later shot is conditioned on shot 1, never on its predecessor, because
 * chaining compounds drift and serialises what could run at once. The clips
 * come from the same Veo model Blink AI runs on.
 *
 * What is new is only the shape: N scenes rendered as a set, tracked as rows,
 * and handed to the browser in order.
 */

export const SCENE_COUNT = { min: 2, max: 6, default: 4 }
export const MAX_IDEA = 600

/**
 * The house look, applied to every frame in a reel.
 *
 * Photoreal rather than the carousel's Pixar style: this is footage that has to
 * pass as something somebody filmed on a phone, and a 3D-rendered character
 * reads as an advert the moment it moves.
 *
 * The no-text clause is here for the reason it is in animated.js — image models
 * letter a vertical canvas unprompted — and it matters more here, because text
 * baked into frame one gets animated by Veo into text that warps and smears.
 */
const STYLE =
  'Shot on a modern smartphone, photorealistic, natural available light, shallow depth of field, ' +
  'candid handheld framing, authentic amateur UGC look, sharp focus on the subject. ' +
  'Absolutely no text, no lettering, no captions, no subtitles, no watermark, no logos, no user interface.'

export function validate({ idea, sceneCount }) {
  const text = String(idea || '').trim()
  if (!text) throw badRequest('Tell us what the video should be about.')
  if (text.length > MAX_IDEA) throw badRequest(`Keep the idea under ${MAX_IDEA} characters.`)

  const n = Math.round(Number(sceneCount ?? SCENE_COUNT.default))
  if (!Number.isFinite(n) || n < SCENE_COUNT.min || n > SCENE_COUNT.max) {
    throw badRequest(`Pick between ${SCENE_COUNT.min} and ${SCENE_COUNT.max} scenes.`)
  }

  return { idea: text, sceneCount: n }
}

/**
 * Split the idea into shots, and write the voiceover.
 *
 * One model call for both, not two. The script has to match the shots it plays
 * over — a narration written in a second, separate pass is writing blind about
 * scenes it was only told about second-hand, and the seam shows as a voiceover
 * that describes the wrong moment. Asking for both at once means the model
 * plans the arc and narrates the plan it just made.
 *
 * Each scene carries two prompts because they go to two models. `frame` is a
 * still-image description for nano-banana; `motion` is what Veo should animate
 * within it. Splitting them is what stops the video model being handed a
 * paragraph of composition it will ignore, and the image model being handed
 * verbs it cannot draw.
 */
export async function planReel({ brand, idea, sceneCount, durationSeconds }) {
  const name = brand?.appName?.trim() || 'the product'
  const category = brand?.category?.trim() || 'product'
  const tagline = brand?.tagline?.trim() || ''
  const totalSeconds = sceneCount * durationSeconds

  const prompt = [
    'You are a short-form video director writing a vertical social ad. Plain, spoken language. No hashtags, no emoji.',
    '',
    `Brand: "${name}" — a ${category} brand.`,
    tagline && `Tagline: "${tagline}"`,
    `The video should be about: "${idea}"`,
    '',
    `Plan exactly ${sceneCount} scenes. Each scene is a separate ${durationSeconds}-second shot, played back to back,`,
    `so the whole video runs ${totalSeconds} seconds.`,
    'Scene 1 must open on something that stops the scroll. The last scene must land the call to action.',
    'The scenes share one location and one person throughout — describe that same person identically every time.',
    '',
    `Then write ONE voiceover script for the whole video, spoken aloud in about ${totalSeconds} seconds`,
    `(roughly ${Math.max(12, Math.round(totalSeconds * 2.4))} words). It must read as continuous narration,`,
    'not as a list of scene captions.',
    '',
    'Return ONLY minified JSON, no markdown fence, matching exactly:',
    '{"title":"<max 6 words naming this video>",',
    '"script":"<the full voiceover, plain prose>",',
    '"scenes":[{"description":"<what happens in this shot, one short sentence>",',
    '"frame":"<the opening still: subject, wardrobe, setting, framing, lighting — no motion verbs>",',
    '"motion":"<what moves during the shot, one short phrase>"}]}',
  ]
    .filter(Boolean)
    .join('\n')

  const parsed = parseJson(await complete(prompt))
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : []

  // A short plan is a failed plan, not a smaller reel. The caller has already
  // reserved allowance for sceneCount clips and told the user how many shots
  // they are getting, so quietly delivering three of four is worse than saying
  // it did not work.
  if (scenes.length < sceneCount) {
    throw new ApiError(502, 'plan_incomplete', 'The director returned an incomplete plan. Try again.')
  }

  return {
    title: String(parsed?.title || '').trim().slice(0, 80) || truncate(idea, 60),
    script: String(parsed?.script || '').trim().slice(0, 4000),
    scenes: scenes.slice(0, sceneCount).map((s) => ({
      description: String(s?.description || '').trim().slice(0, 300),
      frame: String(s?.frame || '').trim().slice(0, 600),
      motion: String(s?.motion || 'subtle handheld camera movement').trim().slice(0, 300),
    })),
  }
}

/**
 * Models wrap JSON in a markdown fence more often than not, whatever the prompt
 * says. Strip it rather than failing a whole paid generation over backticks.
 *
 * Lifted from animated.js unchanged. Left as a copy rather than shared: the two
 * are identical today by coincidence, and the moment either model is swapped
 * the failure modes stop matching. It is fifteen lines.
 */
function parseJson(raw) {
  const cleaned = String(raw)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) {
      throw new ApiError(502, 'plan_unparseable', 'The director returned something unreadable. Try again.')
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      throw new ApiError(502, 'plan_unparseable', 'The director returned something unreadable. Try again.')
    }
  }
}

const framePrompt = (scene) => `${STYLE}\n\n${scene.frame}`

/**
 * The prompt Veo gets for one scene.
 *
 * Short on purpose. The still already carries the subject, the wardrobe, the
 * room and the framing — restating them here gives the video model licence to
 * reinterpret them, and what comes back is a different person in a different
 * room. Saying only what moves is what keeps the clip anchored to the frame it
 * started from.
 */
export const motionPrompt = (scene) =>
  `${scene.motion}. The shot continues naturally from the starting frame: same person, same clothes, ` +
  `same location, same lighting. Natural spoken audio and ambient room tone.`

/**
 * Render every opening frame, holding one person across all of them.
 *
 * Frame 1 establishes; frames 2..n are conditioned on it and run concurrently.
 * `onFrame` is awaited as each lands so the caller can archive it — a reel is
 * several clips of somebody's money, and the frames are the cheap half that
 * should survive a failure in the expensive half.
 *
 * Awaited, not fired and forgotten: onFrame uploads, so it can reject, and an
 * unawaited rejection on Node exits the process. One slide upload failing took
 * the whole API down once already — see the same note in animated.js.
 */
export async function renderFrames({ scenes, aspectRatio, onFrame }) {
  const first = await generateFirstSlide(framePrompt(scenes[0]), { aspectRatio })
  await onFrame?.(0, first)

  const rest = await Promise.all(
    scenes.slice(1).map(async (scene, i) => {
      const url = await generateSlideFrom(
        first,
        `Keep the EXACT same person from the reference image — identical face, identical hair, ` +
          `identical clothing — and the same location, lighting and photographic style. ` +
          `Change only the framing and what they are doing.\n\n` +
          `Now: ${scene.frame}\n\n${STYLE}`,
        { aspectRatio }
      )
      await onFrame?.(i + 1, url)
      return url
    })
  )

  return [first, ...rest]
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

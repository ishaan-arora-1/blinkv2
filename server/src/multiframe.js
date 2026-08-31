import {
  complete,
  generateFirstSlide,
  generateSlideFrom,
  generateSceneWithProduct,
  describeImage,
} from './fal.js'
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
 * The brief for this feature was that the output must not look like AI. Most of
 * what follows is therefore written against the specific tells that give
 * generated footage away, and two of them were in the first version of this
 * prompt:
 *
 * "shallow depth of field" is the worse of the two. It reads as a synonym for
 * "cinematic", and it is exactly backwards for this. A phone's main camera has
 * a tiny sensor and a deep focal plane — everything from the hand to the far
 * wall is sharp unless portrait mode is on. Blurred backgrounds are the single
 * most reliable giveaway that a "phone" shot was not taken on a phone.
 *
 * "photorealistic" is the other. Image models read it as a bid for maximum
 * polish and answer with glossy skin, symmetrical faces and studio-clean light,
 * which is the look this feature has to avoid. The word is gone; what is
 * described instead is a specific, ordinary photograph.
 *
 * The rest is a list of the things real phone photos have and generated ones
 * almost never do: skin with texture in it, uneven light with more than one
 * colour temperature in the room, framing that is slightly off, and no grade.
 *
 * The no-text clause stays, for the reason it exists in animated.js — image
 * models letter a vertical canvas unprompted — and it matters more here,
 * because text baked into frame one gets animated by Veo into text that warps.
 */
const STYLE = [
  'A casual snapshot taken on an ordinary smartphone, the kind of photo a real person posts.',
  'Everything in the frame is in focus, front to back, like a phone camera with no portrait mode — no blurred background, no bokeh.',
  'Lit only by the light already in the room: daylight through a window, or a plain ceiling bulb.',
  'The light is uneven and a little unflattering, with mixed colour temperature and ordinary shadows.',
  'The person is an ordinary-looking human being, not a model: real skin with visible pores and texture, slight blemishes,',
  'an asymmetric face, hair that is not perfectly in place, little or no makeup, plain everyday clothes that are slightly creased.',
  'The room is a real lived-in space, plain and a bit imperfect, containing only what would genuinely be there.',
  'Colours are flat and true to life, straight out of the camera with no colour grading, and there is faint sensor noise.',
  'Framing is casual and slightly off-centre, shot at eye level from a normal standing distance.',
].join(' ')

/**
 * What the frame must not contain.
 *
 * A separate list because the positives above describe a photograph and these
 * name the aesthetic to stay out of. Image models drift toward advertising
 * whenever the subject is a product, and this is the counterweight.
 */
const AVOID = [
  'Not a stock photo, not an advertisement, not a magazine shoot, not cinematic.',
  'No studio lighting, no softbox, no rim light, no lens flare, no dramatic or moody lighting.',
  'No shallow depth of field, no background blur, no vignette, no HDR, no teal-and-orange grading, no oversaturation.',
  'No airbrushed or plastic skin, no flawless symmetrical model faces, no glamour, no posing for the camera.',
  'No staged or decorated set, no props that were not asked for, no clutter added for effect.',
  'Absolutely no text, no lettering, no captions, no subtitles, no watermark, no logos, no user interface.',
].join(' ')

/**
 * The same instruction in the form Veo takes it.
 *
 * The still sets the look, but the video model re-renders every frame and will
 * drift back toward polish over eight seconds if nothing holds it. Veo has a
 * real negative_prompt field, so the avoid-list goes there rather than being
 * buried in prose the model may or may not weigh.
 */
export const VIDEO_NEGATIVE = [
  'cinematic, film look, advertisement, stock footage, studio lighting, dramatic lighting,',
  'shallow depth of field, bokeh, background blur, lens flare, vignette, colour grading, oversaturated,',
  'airbrushed skin, plastic skin, model face, glamour, slow motion,',
  'text, captions, subtitles, watermark, logo, user interface, distorted hands, extra fingers, morphing objects',
].join(' ')

/**
 * How the product is described to the image model.
 *
 * Written as an instruction about a specific object in a specific photograph
 * rather than as a description, because the failure being designed against is
 * the model treating the reference as inspiration and inventing a similar one.
 */
const productClause = (n) =>
  `The object shown in reference image ${n} is the real product this is about. Reproduce it EXACTLY as ` +
  `photographed — identical shape, identical proportions, identical colour, identical material, identical ` +
  `label and markings. Do not redesign it, do not restyle it, do not substitute a similar object, and do ` +
  `not add branding it does not have. It should sit in the scene as a real object someone actually owns, ` +
  `lit by the same room light as everything else.`

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
export async function planReel({ brand, idea, sceneCount, durationSeconds, product }) {
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
    // What the customer actually sells, read off the photo they uploaded. The
    // typed idea is usually a sentence long — "a reel for my candle" — which is
    // not enough for the director to stage a shot around the thing. Giving it
    // the colour, material and size means the scenes are about this object
    // rather than a generic one.
    product && `The product in the video is a real object the customer photographed: ${product}.`,
    product && 'Every scene must feature that product. Describe it in each frame as the same physical object.',
    '',
    `Plan exactly ${sceneCount} scenes. Each scene is a separate ${durationSeconds}-second shot, played back to back,`,
    `so the whole video runs ${totalSeconds} seconds.`,
    'Scene 1 must open on something that stops the scroll. The last scene must land the call to action.',
    'The scenes share one location and one person throughout — describe that same person identically every time.',
    // The look is enforced again at image time, but a director that writes
    // "a beautiful young woman in a sunlit modern kitchen" has already lost it:
    // the frame prompt inherits those words and the image model obliges.
    'That person must be an ordinary, average-looking adult — not a model, not conventionally beautiful,',
    'plainly dressed, in an unremarkable real home. Never use words like beautiful, stunning, perfect,',
    'flawless, cinematic, sleek, modern or aesthetic. Describe what is there, plainly.',
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

const framePrompt = (scene) => `${scene.frame}\n\n${STYLE}\n\n${AVOID}`

/**
 * The prompt Veo gets for one scene.
 *
 * Short on purpose. The still already carries the subject, the wardrobe, the
 * room and the framing — restating them here gives the video model licence to
 * reinterpret them, and what comes back is a different person in a different
 * room. Saying only what moves is what keeps the clip anchored to the frame it
 * started from.
 */
export const motionPrompt = (scene, { hasProduct = false } = {}) =>
  `${scene.motion}. The shot continues naturally from the starting frame: same person, same clothes, ` +
  `same location, same room lighting, same ordinary phone-camera look throughout.` +
  (hasProduct
    ? ` The product stays exactly as it appears in the starting frame — same shape, same colour, same label — and does not morph or change.`
    : '') +
  ` Natural spoken audio and ambient room tone. Handheld, with the small unsteadiness of a real phone.`

/**
 * Read the customer's product photo, so the director can write about it.
 *
 * Best-effort by design — see describeImage. A reel without this is a reel
 * whose scenes are written from the typed idea alone, which is how it worked
 * before and is still perfectly serviceable.
 */
export function describeProduct(productUrl) {
  if (!productUrl) return Promise.resolve(null)
  return describeImage(
    productUrl,
    'Describe this product in one plain sentence for someone who has to place it in a photograph. ' +
      'Say what the object is, its colour, its material and roughly how big it is in the hand. ' +
      'Describe only what you can see. Do not sell it, do not use adjectives like beautiful or premium, ' +
      'and do not mention the background.'
  )
}

/**
 * Render every opening frame, holding one person — and one product — across all
 * of them.
 *
 * Frame 1 establishes. When there is a product photo it is generated from that
 * photo, so the real object is in the reel from the first frame rather than
 * being approximated from words.
 *
 * Frames 2..n are then conditioned on *two* references: frame 1 for the person
 * and the room, and the product photo again for the object. Passing frame 1
 * alone would work in theory — the product is already in it — but each
 * generation re-reads its references, and an object that has been through one
 * round of generation drifts a little further on the next. Handing the original
 * photograph back every time is what stops the candle slowly becoming a
 * different candle by scene four.
 *
 * They still condition on frame 1 rather than on their predecessor, which is
 * the rule the animated carousels established: chaining compounds drift and
 * serialises a batch that could run at once.
 *
 * `onFrame` is awaited as each lands so the caller can archive it — a reel is
 * several clips of somebody's money, and the frames are the cheap half that
 * should survive a failure in the expensive half. Awaited, not fired and
 * forgotten: onFrame uploads, so it can reject, and an unawaited rejection on
 * Node exits the process.
 */
export async function renderFrames({ scenes, aspectRatio, productUrl, onFrame }) {
  const first = productUrl
    ? await generateSceneWithProduct(
        productUrl,
        `${scenes[0].frame}\n\n${productClause(1)}\n\n${STYLE}\n\n${AVOID}`,
        { aspectRatio }
      )
    : await generateFirstSlide(framePrompt(scenes[0]), { aspectRatio })

  await onFrame?.(0, first)

  const rest = await Promise.all(
    scenes.slice(1).map(async (scene, i) => {
      const refs = productUrl ? [first, productUrl] : [first]

      const instruction = productUrl
        ? `Reference image 1 fixes the person and the place: keep the EXACT same person — identical face, ` +
          `identical hair, identical clothing — in the same room, with the same light and the same ordinary ` +
          `phone-camera look. Change only the framing and what they are doing.\n\n${productClause(2)}\n\n` +
          `Now: ${scene.frame}`
        : `Keep the EXACT same person from the reference image — identical face, identical hair, ` +
          `identical clothing — and the same location, lighting and photographic style. ` +
          `Change only the framing and what they are doing.\n\nNow: ${scene.frame}`

      const body = `${instruction}\n\n${STYLE}\n\n${AVOID}`

      // Two references is the better result and the less certain call: it
      // depends on the edit model accepting a list, which is a property of
      // whatever model FAL_EDIT_MODEL currently names rather than something
      // this code controls. If it refuses, fall back to conditioning on frame
      // one alone — the product is still in that frame, so the scene is right,
      // it just has one more generation between it and the original photo.
      // A slightly drifted candle beats a reel that failed at scene two.
      let url
      try {
        url = await generateSlideFrom(refs, body, { aspectRatio })
      } catch (err) {
        if (refs.length < 2) throw err
        console.warn(`[multiframe] scene ${i + 1}: two-reference edit failed, retrying with the frame alone —`, err?.message || err)
        url = await generateSlideFrom(first, body, { aspectRatio })
      }

      await onFrame?.(i + 1, url)
      return url
    })
  )

  return [first, ...rest]
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

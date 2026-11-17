import { env } from './env.js'
import { badRequest } from './middleware/errors.js'
import { generateSlideFrom } from './fal.js'

/**
 * AI Actors: a person reads your script to camera.
 *
 * The format the whole UGC-ad category is sold on — a creator, a phone, a
 * script — and the one Blink could not make: Blink AI scenes are filmed with
 * mouths deliberately still and narrated over the top, because the video model
 * cannot hold one voice across separate clips. This is the other half. One
 * still, one narration track, and an avatar model that moves the face to the
 * words: Kling AI Avatar v2 on fal, $0.056 a second.
 *
 * The stills are the ten creators the hook-video library already uses, so a
 * customer meets the same faces across every format. A customer may also give
 * us a photo of themselves — "clone yourself" — on the condition that they
 * have the right to use that face, which the route makes them say.
 */

/**
 * The roster. Voices are a default, not a binding — any of the eight can be
 * picked for any actor — but a default that matches the face is the difference
 * between the first render sounding right and sounding dubbed.
 */
export const ACTORS = [
  { id: 'cr_casual_girl',    name: 'Chloe',  vibe: 'Everyday girl, 20s',  img: '/creators/casual-girl.jpg',    voice: 'Rachel' },
  { id: 'cr_tech_girl',      name: 'Nina',   vibe: 'Tech girl, 20s',      img: '/creators/tech-girl.jpg',      voice: 'Aria' },
  { id: 'cr_gym_girl',       name: 'Lena',   vibe: 'Fitness, 20s',        img: '/creators/gym-girl.jpg',       voice: 'Sarah' },
  { id: 'cr_business_woman', name: 'Diana',  vibe: 'Professional, 30s',   img: '/creators/business-woman.jpg', voice: 'Charlotte' },
  { id: 'cr_older_woman',    name: 'Susan',  vibe: 'Trustworthy, 55+',    img: '/creators/older-woman.jpg',    voice: 'Charlotte' },
  { id: 'cr_casual_guy',     name: 'Sam',    vibe: 'Everyday guy, 20s',   img: '/creators/casual-guy.jpg',     voice: 'Liam' },
  { id: 'cr_tech_guy',       name: 'Ethan',  vibe: 'Tech guy, 20s',       img: '/creators/tech-guy.jpg',       voice: 'Will' },
  { id: 'cr_gym_guy',        name: 'Jake',   vibe: 'Fitness, 20s',        img: '/creators/gym-guy.jpg',        voice: 'Will' },
  { id: 'cr_dad_guy',        name: 'Mike',   vibe: 'Dad energy, 40s',     img: '/creators/dad-guy.jpg',        voice: 'Adam' },
  { id: 'cr_older_man',      name: 'Frank',  vibe: 'Trustworthy, 60+',    img: '/creators/older-man.jpg',      voice: 'Brian' },
]

export const CUSTOM_ACTOR = 'custom'

export function actorById(id) {
  return ACTORS.find((a) => a.id === id) || null
}

export const SCRIPT = { min: 12, max: 900 }

/**
 * The longest a single take may run. Kling holds a face convincingly for about
 * a minute; past that the head starts to loop its own movements, and a UGC ad
 * longer than sixty seconds is rarely the ad that wins anyway.
 */
export const MAX_SECONDS = 60

/**
 * How long a script will take to say, before it is said.
 *
 * Used to check the allowance up front, so nobody pays for a voice track and
 * then hears they cannot afford the video. ~2.6 words a second is conversational
 * UGC pace; the half-second covers the breath before the first word. The real
 * number replaces this the moment the narration exists.
 */
export function estimateSeconds(script) {
  const words = String(script || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.ceil(words / 2.6 + 0.5))
}

export function validateScript(raw) {
  const script = String(raw || '').replace(/\s+/g, ' ').trim()
  if (script.length < SCRIPT.min) throw badRequest('Write a line or two for the actor to say.')
  if (script.length > SCRIPT.max) throw badRequest(`Keep the script under ${SCRIPT.max} characters — about a minute spoken.`)
  if (estimateSeconds(script) > MAX_SECONDS) {
    throw badRequest(`That script runs past ${MAX_SECONDS} seconds. Trim it, or split it into two takes.`)
  }
  return script
}

/**
 * What the avatar model is asked for, beyond moving the lips.
 *
 * Kling animates the whole frame, and left to itself it plays a newsreader:
 * dead-centre, motionless, eyes locked. Real UGC is the opposite — the head
 * moves, the hands come up, the eyes go off-camera when someone is thinking.
 */
export const AVATAR_PROMPT = [
  'A real person filming themselves on their phone, talking naturally and casually to the camera like a friend,',
  'genuine expressions, natural head movement, occasional small hand gestures, blinking normally,',
  'handheld phone footage with slight natural camera movement, authentic UGC style.',
  'Keep the person and the background exactly as in the image. No text, no captions.',
].join(' ')

/**
 * Put the customer's product in the actor's hand.
 *
 * The same move multiframe makes for its scenes — the edit model with the
 * product photograph as a reference, worded so it reproduces the object rather
 * than taking inspiration from it — applied to one portrait. The face is
 * reference 1 and must not change, or the creator the customer picked is no
 * longer the creator in the video.
 */
export function composeWithProduct(faceUrl, productUrl) {
  const prompt = [
    'Image 1 is a real person in a real room. Image 2 is a real product.',
    'Produce the same photograph as image 1 — the IDENTICAL person, identical face, identical hair, identical clothes,',
    'identical room, identical lighting, identical framing and camera angle — but now the person is holding the product',
    'from image 2 casually in one hand, at chest height, turned slightly towards the camera so it is clearly visible,',
    'the way someone shows a product in a selfie video. Reproduce the product EXACTLY as photographed: identical shape,',
    'proportions, colour, material, label and markings, at a realistic size for the hand holding it.',
    'Do not redesign the product or add branding. The mouth is closed and relaxed.',
    'A casual smartphone photo, everything in focus, natural light, no text, no captions, no watermark.',
  ].join(' ')
  return generateSlideFrom([faceUrl, productUrl], prompt, { aspectRatio: '9:16' })
}

export const avatarConfigured = () => env.fal.configured && Boolean(env.fal.avatarModel)

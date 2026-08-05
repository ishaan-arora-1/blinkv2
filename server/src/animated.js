import { complete, generateFirstSlide, generateSlideFrom } from './fal.js'
import { characterById } from './characters.js'
import { badRequest, ApiError } from './middleware/errors.js'

export const SLIDE_COUNT = { min: 3, max: 8, default: 5 }
export const MAX_TOPIC = 400

/**
 * The house style. Every slide in every animated carousel goes through this, so
 * a carousel looks like one piece of work rather than five separate renders.
 *
 * The negative-space clause is load-bearing: the text is a draggable overlay,
 * not part of the image, so a composition with the character's head in the top
 * third leaves the hook nowhere to sit. "No text" is repeated because image
 * models are strongly inclined to letter a poster-shaped canvas anyway.
 */
const STYLE =
  'Pixar-style 3D rendered character illustration, glossy cinematic studio lighting, ' +
  'smooth subsurface-scattering skin, high detail. Generous clean negative space across ' +
  'the top third of the frame for a text overlay. Absolutely no text, no lettering, no ' +
  'words, no numbers, no logos, no watermark, no user interface.'

export function validate({ topic, slideCount, characterId }) {
  const t = String(topic || '').trim()
  if (!t) throw badRequest('Tell us what the carousel should be about.')
  if (t.length > MAX_TOPIC) throw badRequest(`Keep the topic under ${MAX_TOPIC} characters.`)

  const n = Math.round(Number(slideCount ?? SLIDE_COUNT.default))
  if (!Number.isFinite(n) || n < SLIDE_COUNT.min || n > SLIDE_COUNT.max) {
    throw badRequest(`Pick between ${SLIDE_COUNT.min} and ${SLIDE_COUNT.max} slides.`)
  }

  const character = characterById(characterId)
  if (!character) throw badRequest('Pick a character.')

  return { topic: t, slideCount: n, character }
}

/**
 * Write the carousel.
 *
 * Returns a palette and one entry per slide: heading, supporting line, and the
 * action the character is performing. The action is what ties the picture to
 * the words — it is generated from the same pass that writes the copy, so slide
 * three's pose is about slide three's sentence rather than being decorative.
 */
export async function writeCopy({ brand, topic, slideCount, character }) {
  const name = brand?.appName?.trim() || 'the product'
  const category = brand?.category?.trim() || 'product'
  const tagline = brand?.tagline?.trim() || ''

  const prompt = [
    'You write short, punchy Instagram carousel copy. Plain language, no hashtags, no emoji.',
    '',
    `Brand: "${name}" — a ${category} brand.`,
    tagline && `Tagline: "${tagline}"`,
    `The carousel should be about: "${topic}"`,
    '',
    `Write exactly ${slideCount} slides. Slide 1 is the hook that stops the scroll.`,
    `Slides 2 to ${slideCount - 1} make the argument, one idea each.`,
    `Slide ${slideCount} is the call to action and must name ${name}.`,
    '',
    'Return ONLY minified JSON, no markdown fence, matching exactly:',
    '{"palette":"<short phrase naming ONE background colour scheme, e.g. deep violet with soft magenta glow>",',
    '"slides":[{"h":"<heading, max 7 words>","s":"<supporting line, max 16 words>",',
    '"action":"<what the character is physically doing, one short phrase, must match this slide\'s words>"}]}',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await complete(prompt)
  const parsed = parseJson(raw)

  const slides = Array.isArray(parsed?.slides) ? parsed.slides : []
  if (slides.length < slideCount) {
    throw new ApiError(502, 'copy_incomplete', 'The copy writer returned an incomplete carousel. Try again.')
  }

  return {
    palette: String(parsed.palette || 'deep violet with a soft radial glow').slice(0, 120),
    slides: slides.slice(0, slideCount).map((s) => ({
      h: String(s?.h || '').trim().slice(0, 90),
      s: String(s?.s || '').trim().slice(0, 200),
      action: String(s?.action || 'standing and smiling at the camera').trim().slice(0, 200),
    })),
  }
}

/**
 * Models wrap JSON in a markdown fence more often than not, whatever the prompt
 * says. Strip it rather than failing a whole paid generation over backticks.
 */
function parseJson(raw) {
  const cleaned = String(raw)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Last resort: the outermost object in the response.
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) {
      throw new ApiError(502, 'copy_unparseable', 'The copy writer returned something unreadable. Try again.')
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      throw new ApiError(502, 'copy_unparseable', 'The copy writer returned something unreadable. Try again.')
    }
  }
}

const scenePrompt = ({ character, palette, action }) =>
  `${STYLE}\n\nBackground: ${palette}, as a smooth studio backdrop.\n\n` +
  `Character: ${character.brief}.\n\nAction: the character is ${action}.`

/**
 * Render every slide, holding one character across all of them.
 *
 * Slide 1 establishes the look. Slides 2..n are each conditioned on slide 1's
 * image and run concurrently — they do not depend on each other, and chaining
 * them would both serialise the batch and let the character drift a little
 * further with every hop.
 *
 * `onProgress` is called as each slide lands so a caller can persist partial
 * results; a five-slide carousel is thirty-odd seconds of somebody's money and
 * losing all of it to one failed slide is worth avoiding.
 */
export async function renderSlides({ character, palette, slides, onProgress }) {
  const first = await generateFirstSlide(
    scenePrompt({ character, palette, action: slides[0].action })
  )
  // Awaited, not fired and forgotten. onProgress archives the image, so it is
  // async and it can fail — an unawaited rejection here is an unhandled promise
  // rejection, which on Node is a hard process exit. One slide failing to
  // upload took the entire API down for every user on it.
  await onProgress?.(0, first)

  const rest = await Promise.all(
    slides.slice(1).map(async (slide, i) => {
      const url = await generateSlideFrom(
        first,
        `Keep the EXACT same character from the reference image — identical face, identical hair, ` +
          `identical clothing. Keep the identical background colour and the identical 3D rendering ` +
          `style. Change only the pose and action.\n\n` +
          `Now: the character is ${slide.action}.\n\n${STYLE}`
      )
      await onProgress?.(i + 1, url)
      return url
    })
  )

  return [first, ...rest]
}

import { complete } from './fal.js'

/**
 * Writes the words for a daily marketing carousel.
 *
 * The shape is fixed and only the words move: a hook, three tips, and a payoff
 * slide whose copy lives in carouselArt.js and is never generated. That split
 * is deliberate — the payoff slide makes a claim about the product, and a claim
 * regenerated every morning by a model is a claim that will eventually be
 * false.
 *
 * One vendor call per day. The backgrounds are CSS gradients, so nothing here
 * touches an image model.
 */

// Rotated rather than random so a week of posts covers a week of ground. A
// random pick from a list this size repeats within days and looks like a bot.
const ANGLES = [
  'why most carousels lose the reader on the first slide',
  'writing hooks that stop a thumb mid-scroll',
  'how often to post, and what to post between launches',
  'turning one idea into a week of content',
  'what makes people save a post instead of liking it',
  'why consistency beats production value on social',
  'writing a call to action people actually follow',
  'reading your own analytics without fooling yourself',
  'the difference between content that sells and content that performs',
  'building a brand voice small enough to keep up with',
  'what to do when a post flops',
  'why the second slide matters more than the first',
  'repurposing without sounding repetitive',
  'the case against posting every single day',
]

/** Deterministic per-day, so two runs on the same date do not post two topics. */
export function angleForDate(date = new Date()) {
  const days = Math.floor(date.getTime() / 86_400_000)
  return ANGLES[days % ANGLES.length]
}

const PROMPT = (angle) => `You write Instagram carousels for a marketing audience:
founders, solo marketers and small brand teams.

Today's angle: ${angle}

Write a 4-part carousel opening. Return ONLY minified JSON, no markdown fence:

{"kicker":"","headline":"","cta":"","tips":[{"headline":"","body":""},{"headline":"","body":""},{"headline":"","body":""}]}

Rules:
- "kicker": 2-4 words naming the category, sentence case. It labels the topic,
  it is not a slogan. Good: "Marketing hacks 101", "Content basics".
  Bad: "Analytics wisdom", "Growth secrets" — vague nouns dressed up as insight.
- "headline": the hook. Under 55 characters. Contrarian or surprising, never a
  question. It must be a claim someone would argue with.
- "cta": 2-3 words pointing into the carousel, and grammatical on its own.
  Good: "Three fixes", "See the truth". Bad: "See truth", "Learn more".
- Each tip "headline": under 34 characters, an imperative. No numbering — the
  slide already carries the number.
- Each tip "body": 14-24 words, and NEVER more than 120 characters total. It is
  set in a narrow column; anything longer overruns the slide. Concrete and
  immediately usable. Give the reason the tactic works, not just the tactic.
- Never invent statistics, percentages, follower counts or study results. No
  "studies show", no "90% of marketers". If you cannot make the point without a
  number, make a different point.
- Sentence case everywhere. Never Title Case — the slides set headlines in a
  heavy display face and Title Case reads as a stock template.
- Banned phrases, no exceptions: "context is king", "content is king", "game
  changer", "game-changing", "leverage", "unlock", "supercharge", "deep dive",
  "move the needle", "low-hanging fruit", "at the end of the day", "in today's
  fast-paced world", "it's not just X, it's Y". These are what makes copy read
  as machine-written.
- No emoji. No hashtags. Plain apostrophes.
- Write like one practitioner telling another something they learned the hard
  way. Not a brand, not a coach, not a LinkedIn post.
- The three tips must be genuinely useful to someone who never buys anything.`

function parse(raw) {
  // Models wrap JSON in a fence more often than not, whatever the prompt says.
  // Slice from the first brace to the *last* one: the object is nested, so
  // anything anchored on the first closing brace truncates inside tips[0].
  const s = String(raw)
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error(`Copy generator returned no JSON object. Got: ${s.slice(0, 200)}`)
  }

  let data
  try {
    data = JSON.parse(s.slice(start, end + 1))
  } catch (err) {
    throw new Error(`Copy generator returned malformed JSON (${err.message}): ${s.slice(0, 200)}`)
  }

  const tips = Array.isArray(data.tips) ? data.tips.slice(0, 3) : []
  if (tips.length < 3) throw new Error(`Copy generator returned ${tips.length} tips, needed 3`)
  for (const t of tips) {
    if (!t?.headline || !t?.body) throw new Error('A tip came back without a headline or body')
  }
  if (!data.headline) throw new Error('Copy generator returned no hook headline')

  return {
    kicker: data.kicker || 'Marketing hacks 101',
    headline: data.headline,
    cta: data.cta || 'Three fixes',
    tips: tips.map((t) => ({ headline: t.headline, body: t.body })),
  }
}

/**
 * Arrange a hook and three tips into render order.
 *
 * Shared by the generated path and the hand-written one so a carousel someone
 * wrote themselves goes through the identical render, upload and publish steps.
 * A second path for hand-written copy is a second path to keep correct.
 */
/**
 * Strip markdown the slide cannot render.
 *
 * The renderer puts text into the DOM as text, not as markup — deliberately, so
 * a model cannot inject elements. The side effect is that *emphasis* arrives on
 * the slide as literal asterisks. Models reach for it unprompted often enough
 * that asking them not to is less reliable than removing it here.
 */
const clean = (s) =>
  String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\w)[*_](\S(?:.*?\S)?)[*_](?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

export function buildCopy(copy, { angle = 'hand-written' } = {}) {
  const tidy = {
    kicker: clean(copy.kicker),
    headline: clean(copy.headline),
    cta: clean(copy.cta),
    tips: copy.tips.map((t) => ({ headline: clean(t.headline), body: clean(t.body) })),
  }
  return {
    angle,
    slides: [
      { kicker: tidy.kicker, headline: tidy.headline, cta: tidy.cta },
      ...tidy.tips,
      {}, // payoff slide: fixed copy, owned by carouselArt.js
    ],
    hook: tidy,
  }
}

/** Validate a hand-written carousel, same rules as a generated one. */
export function copyFromJson(obj) {
  const tips = Array.isArray(obj?.tips) ? obj.tips : []
  if (tips.length !== 3) throw new Error(`Expected exactly 3 tips, got ${tips.length}`)
  for (const t of tips) {
    if (!t?.headline || !t?.body) throw new Error('A tip is missing a headline or body')
  }
  if (!obj?.headline) throw new Error('Missing the hook headline')

  return buildCopy({
    kicker: obj.kicker || 'Marketing hacks 101',
    headline: obj.headline,
    cta: obj.cta || 'Three fixes',
    tips: tips.map((t) => ({ headline: t.headline, body: t.body })),
  })
}

// Lower-cased and matched as substrings. Kept next to the prompt's banned list
// on purpose: asking a model not to do something is a preference, checking is
// the rule. Nothing here reaches the account unattended without passing.
const BANNED = [
  'context is king', 'content is king', 'game changer', 'game-changing',
  'leverage', 'unlock', 'supercharge', 'deep dive', 'move the needle',
  'low-hanging fruit', 'at the end of the day', 'fast-paced world',
  'studies show', 'research shows', 'experts agree',
]

// Two different questions, and conflating them cost a run.
//
// BODY_OVERFLOW is a layout fact: past roughly this many characters the body
// pushes the logo off the bottom of the slide. BODY_TARGET is taste — copy
// longer than this is wordy, not broken. Only the first is worth refusing to
// post over. A daily job that fails because the model wrote 125 characters
// instead of 120 is a job that silently stops posting.
const BODY_OVERFLOW = 240
const BODY_TARGET = 120
const HEADLINE_MAX = 55
const TIP_HEADLINE_MAX = 40

/**
 * What is wrong with a draft, split by whether it should block publication.
 *
 * `hard` means do not post: a cliché, an invented statistic, or copy that will
 * physically break the slide. `soft` means try again for something better, but
 * publish it rather than posting nothing.
 */
function problems(copy) {
  const hard = []
  const soft = []

  const scan = (text, where) => {
    const lower = String(text).toLowerCase()
    for (const phrase of BANNED) {
      if (lower.includes(phrase)) hard.push(`${where} uses the banned phrase "${phrase}"`)
    }
    // A number with a unit is almost always an invented statistic.
    if (/\b\d+\s*(%|percent|x\b)/i.test(text)) hard.push(`${where} contains a statistic: "${text}"`)
  }

  scan(copy.headline, 'headline')
  scan(copy.kicker, 'kicker')
  scan(copy.cta, 'cta')
  if (copy.headline.length > HEADLINE_MAX) {
    soft.push(`headline is ${copy.headline.length} chars, aim for ${HEADLINE_MAX}`)
  }

  copy.tips.forEach((t, i) => {
    scan(t.headline, `tip ${i + 1} headline`)
    scan(t.body, `tip ${i + 1} body`)

    if (t.headline.length > TIP_HEADLINE_MAX) {
      soft.push(`tip ${i + 1} headline is ${t.headline.length} chars, aim for ${TIP_HEADLINE_MAX}`)
    }
    if (t.body.length > BODY_OVERFLOW) {
      hard.push(`tip ${i + 1} body is ${t.body.length} chars — past ${BODY_OVERFLOW} it breaks the slide`)
    } else if (t.body.length > BODY_TARGET) {
      soft.push(`tip ${i + 1} body is ${t.body.length} chars, aim for ${BODY_TARGET}`)
    }
  })

  return { hard, soft }
}

/**
 * Slide copy for a whole carousel, in render order.
 *
 * One retry, because a model handed its own mistakes usually fixes them, and a
 * second LLM call is cheaper than a bad post sitting on the account until
 * somebody notices. If the retry also fails, throw — on the daily schedule that
 * means no post today, which is the right outcome. Nothing is better than bad.
 */
export async function generateCarouselCopy({ angle = angleForDate() } = {}) {
  let copy = parse(await complete(PROMPT(angle)))
  let { hard, soft } = problems(copy)

  if (hard.length || soft.length) {
    const all = [...hard, ...soft]
    console.warn(`  ⚠ first draft had issues:\n${all.map((p) => `      · ${p}`).join('\n')}`)

    const retry =
      `${PROMPT(angle)}\n\nYour previous attempt had these problems:\n` +
      all.map((p) => `- ${p}`).join('\n') +
      `\n\nWrite a new one that fixes every point. Same JSON shape.`

    const second = parse(await complete(retry))
    const check = problems(second)

    // Keep whichever draft is publishable, preferring the retry. A second
    // attempt that fixed the clichés but is still a little wordy is a better
    // post than nothing at all.
    if (!check.hard.length) {
      copy = second
      hard = check.hard
      soft = check.soft
      console.warn(soft.length ? '  ✓ retry accepted, minor notes remain' : '  ✓ retry passed clean')
    } else if (!hard.length) {
      console.warn('  ✓ retry was worse — keeping the first draft')
    } else {
      throw new Error(
        `Copy failed twice on things that block a post:\n` +
          check.hard.map((p) => `    · ${p}`).join('\n')
      )
    }
  }

  return buildCopy(copy, { angle })
}

/** The post caption, built from the same copy so the two cannot disagree. */
export function buildCaption({ hook }) {
  const tips = hook.tips.map((t) => `→ ${t.headline.replace(/\.$/, '')}`).join('\n')
  return (
    `${hook.headline}\n\n` +
    `${tips}\n\n` +
    `Swipe for the detail. Slide five is the part people don't believe.\n\n` +
    `#marketingtips #contentstrategy #socialmediamarketing #carousel #foundertips`
  )
}

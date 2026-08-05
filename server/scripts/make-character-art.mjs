/**
 * Generates the character-picker portraits into public/characters/.
 *
 * Run once, by hand, and commit the output — these are static assets, not
 * something to regenerate per user. Costs one image per archetype.
 *
 *   cd server && node scripts/make-character-art.mjs
 *
 * The briefs come from src/characters.js, the same text the real generations
 * use, so the portrait a customer picks is the character they actually get.
 * The backdrop is deliberately neutral and identical across all six: the real
 * carousels colour the background from the brand palette, and a picker where
 * every tile is a different colour reads as six styles rather than one roster.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CHARACTERS } from '../src/characters.js'
import { generateFirstSlide, download } from '../src/fal.js'

const OUT = new URL('../../public/characters/', import.meta.url).pathname

// Only the archetypes with no art yet, so adding one to the roster costs one
// image rather than the whole set. These generations are not deterministic —
// regenerating everything would also quietly replace portraits that have
// already been reviewed and shipped. `--force` opts back into that.
const FORCE = process.argv.includes('--force')

const BACKDROP =
  'Pixar-style 3D rendered character illustration, glossy cinematic studio lighting, ' +
  'smooth subsurface-scattering skin, high detail. Plain neutral warm-grey studio backdrop ' +
  'with a soft radial falloff, no scenery, no props. Full upper body, centred, facing camera. ' +
  'Absolutely no text, no lettering, no words, no logos, no watermark.'

mkdirSync(OUT, { recursive: true })

const slugOf = (c) => c.id.replace(/^ch_/, '').replace(/_/g, '-')

const todo = CHARACTERS.filter((c) => FORCE || !existsSync(`${OUT}${slugOf(c)}.jpg`))
const skipped = CHARACTERS.length - todo.length
if (skipped) console.log(`skipping ${skipped} archetype(s) that already have art — pass --force to redo them`)
if (!todo.length) {
  console.log('nothing to generate')
  process.exit(0)
}

const results = await Promise.all(
  todo.map(async (c) => {
    const url = await generateFirstSlide(
      `${BACKDROP}\n\nCharacter: ${c.brief}.\n\nAction: standing relaxed, facing the camera with a friendly open expression.`
    )
    const { buffer } = await download(url)

    const slug = slugOf(c)
    const raw = `${OUT}${slug}.png`
    const final = `${OUT}${slug}.jpg`
    writeFileSync(raw, buffer)

    // The picker draws these a couple of hundred pixels wide. A 1 MB PNG per
    // tile is six megabytes to render a chooser.
    execFileSync('sips', ['-Z', '675', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', raw, '--out', final], {
      stdio: 'ignore',
    })
    execFileSync('rm', [raw])

    return { id: c.id, name: c.name, file: `${slug}.jpg` }
  })
)

for (const r of results) console.log(`${r.id.padEnd(20)} → public/characters/${r.file}`)

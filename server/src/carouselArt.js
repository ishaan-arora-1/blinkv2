import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Renders a slide document to a finished 1080 × 1350 PNG.
 *
 * This closes the one gap that stopped a carousel from ever being posted
 * without a person present. Everywhere else in the product a slide is a
 * *document* — a background plus draggable text layers — and the pixels only
 * exist once a browser has laid the text out and CarouselEditor has run toPng
 * over the DOM. Nothing server-side has ever produced the composite, so the
 * `generations` bucket holds backgrounds with no words on them.
 *
 * The renderer here is a headless Chrome rather than a canvas or SVG
 * reimplementation, and that is the whole point: SlidePreview and the editor's
 * TextLayer already mirror each other by hand, and a third implementation of
 * the same layout rules is where they would start to drift. Wrapping, pill
 * padding and the cqw type scale are CSS problems; the cheapest correct answer
 * is to let CSS solve them.
 *
 * Type is sized in cqw against the slide's own width, exactly as SlidePreview
 * does, so what renders here at 1080px is what a person sees in the editor at
 * 380px.
 */

const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

const ASSETS = new URL('../assets/', import.meta.url).pathname
const PUBLIC = new URL('../../public/', import.meta.url).pathname

// Read once at module load. Both faces are variable, so one file covers every
// weight the slides ask for.
const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`

const FONT_UNBOUNDED = dataUri(`${ASSETS}fonts/Unbounded-latin.woff2`, 'font/woff2')
const FONT_GROTESK = dataUri(`${ASSETS}fonts/FamiljenGrotesk-latin.woff2`, 'font/woff2')
const ICON = dataUri(`${PUBLIC}brand/icon.png`, 'image/png')

const face = (family, src) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;` +
  `font-display:block;src:url(${src}) format('woff2')}`

const SHEET = `
${face('Unbounded', FONT_UNBOUNDED)}
${face('Familjen Grotesk', FONT_GROTESK)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;background:#08070c}
.slide{position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;background:#08070c;overflow:hidden;
  container-type:inline-size;font-family:'Familjen Grotesk',sans-serif;-webkit-font-smoothing:antialiased}
.bloom{position:absolute;border-radius:50%;filter:blur(30px);pointer-events:none}
.grain{position:absolute;inset:0;opacity:.17;pointer-events:none;mix-blend-mode:overlay;
  background-image:radial-gradient(rgba(255,255,255,.55) .5px,transparent .5px);background-size:3px 3px}
.vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(4,2,8,.55))}
.pad{position:absolute;inset:0;padding:7cqw;display:flex;flex-direction:column}
.kick{font-family:'Unbounded',sans-serif;font-weight:500;font-size:2.9cqw;letter-spacing:.2em;
  text-transform:uppercase;color:#f3a4e6}
.head{font-family:'Unbounded',sans-serif;font-weight:800;letter-spacing:-.035em;line-height:1.02;
  color:#f0ecf7;text-wrap:balance;text-shadow:0 .4cqw 2.4cqw rgba(8,4,16,.5)}
.body{font-size:4cqw;line-height:1.38;color:#ded6ea;font-weight:500;max-width:25ch;
  text-shadow:0 .3cqw 1.6cqw rgba(8,4,16,.55)}
.pill{display:inline-flex;align-items:center;gap:1.6cqw;align-self:flex-start;
  font-family:'Unbounded',sans-serif;font-weight:500;font-size:3cqw;padding:2.3cqw 4.2cqw;
  border-radius:99px;letter-spacing:.02em}
.pill.glass{background:rgba(255,255,255,.11);color:#f0ecf7;border:1px solid rgba(255,255,255,.2)}
.pill.accent{background:#f3a4e6;color:#20111d;font-weight:600}
.numeral{font-family:'Unbounded',sans-serif;font-weight:800;font-size:18cqw;line-height:.8;
  color:transparent;-webkit-text-stroke:.4cqw rgba(224,196,255,.55);letter-spacing:-.04em}
.mark{display:flex;align-items:center;gap:1.8cqw}
.mark img{width:5.2cqw;height:5.2cqw}
.mark span{font-family:'Unbounded',sans-serif;font-weight:500;font-size:3.1cqw;color:#c0b4d4}
.mark b{color:#f0ecf7;font-weight:500}
`

// There were four-pointed sparkles scattered over slides 1, 3 and 5. They are
// gone deliberately: that exact glyph is Google Gemini's mark, and a decorative
// star on an AI-generated carousel reads as a vendor badge rather than as
// decoration. The blooms carry the atmosphere on their own.

const mark = (size = null) =>
  `<div class="mark"${size ? ` style="margin-bottom:7cqw"` : ''}>` +
  `<img src="${ICON}" alt=""${size ? ` style="width:11cqw;height:11cqw"` : ''}>` +
  `<span${size ? ` style="font-size:6cqw"` : ''}><b>blink</b> ugc</span></div>`

const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

/*
 * The blooms are the whole art direction, and they are pure CSS gradients.
 *
 * That is a deliberate cost decision, not a shortcut: an image model would bill
 * five generations per carousel per day for backgrounds that a radial-gradient
 * renders exactly, forever, for nothing. The only vendor call left in a daily
 * run is the one that writes the words.
 *
 * Each slide places its bloom somewhere different so five slides read as a
 * sequence rather than one layout repeated five times.
 */
const LAYOUTS = [
  // 0 · hook
  ({ kicker, headline, cta }) => `
    <div class="bloom" style="width:86cqw;height:86cqw;right:-24cqw;bottom:-28cqw;opacity:1;
      background:radial-gradient(circle,#d95ae8,#7932c0 58%,transparent 73%)"></div>
    <div class="bloom" style="width:52cqw;height:52cqw;left:-18cqw;top:-14cqw;opacity:.95;
      background:radial-gradient(circle,rgba(243,164,230,.72),transparent 70%)"></div>
    <div class="grain"></div><div class="vig"></div>
    <div class="pad">
      <p class="kick">${esc(kicker)}</p>
      <h2 class="head" style="font-size:8.8cqw;margin-top:4cqw">${esc(headline)}</h2>
      <div style="flex:1"></div>
      <span class="pill glass">${esc(cta)} &nbsp;&rarr;</span>
    </div>`,

  // 1 · tip 01
  ({ headline, body }) => `
    <div class="bloom" style="width:74cqw;height:74cqw;left:-24cqw;bottom:-20cqw;opacity:1;
      background:radial-gradient(circle,#9b3fd6,#6f2dc0 55%,transparent 72%)"></div>
    <div class="bloom" style="width:34cqw;height:34cqw;right:6cqw;top:8cqw;opacity:.55;
      background:radial-gradient(circle,rgba(243,164,230,.5),transparent 70%)"></div>
    <div class="grain"></div><div class="vig"></div>
    <div class="pad">
      <p class="numeral">01</p>
      <h2 class="head" style="font-size:8.4cqw;margin-top:5cqw">${esc(headline)}</h2>
      <p class="body" style="margin-top:4.5cqw">${esc(body)}</p>
      <div style="flex:1"></div>${mark()}
    </div>`,

  // 2 · tip 02
  ({ headline, body }) => `
    <div class="bloom" style="width:78cqw;height:78cqw;right:-26cqw;top:-22cqw;opacity:1;
      background:radial-gradient(circle,#c04fd0,#a245c5 54%,transparent 72%)"></div>
    <div class="bloom" style="width:40cqw;height:40cqw;left:-12cqw;bottom:4cqw;opacity:.6;
      background:radial-gradient(circle,rgba(111,45,192,.85),transparent 70%)"></div>
    <div class="grain"></div><div class="vig"></div>
    <div class="pad">
      <p class="numeral">02</p>
      <h2 class="head" style="font-size:8.4cqw;margin-top:5cqw">${esc(headline)}</h2>
      <p class="body" style="margin-top:4.5cqw">${esc(body)}</p>
      <div style="flex:1"></div>${mark()}
    </div>`,

  // 3 · tip 03
  ({ headline, body }) => `
    <div class="bloom" style="width:88cqw;height:88cqw;left:50%;transform:translateX(-50%);bottom:-38cqw;opacity:1;
      background:radial-gradient(circle,#b747dd,#6f2dc0 56%,transparent 73%)"></div>
    <div class="bloom" style="width:30cqw;height:30cqw;left:8cqw;top:10cqw;opacity:.5;
      background:radial-gradient(circle,rgba(243,164,230,.55),transparent 70%)"></div>
    <div class="grain"></div><div class="vig"></div>
    <div class="pad">
      <p class="numeral">03</p>
      <h2 class="head" style="font-size:8.4cqw;margin-top:5cqw">${esc(headline)}</h2>
      <p class="body" style="margin-top:4.5cqw">${esc(body)}</p>
      <div style="flex:1"></div>${mark()}
    </div>`,

  // 4 · payoff. Fixed copy: this slide is the claim, and a model that rewrites
  // it every morning is a model that will eventually claim something untrue.
  () => `
    <div class="bloom" style="width:104cqw;height:104cqw;left:50%;transform:translateX(-50%);top:8cqw;opacity:1;
      background:radial-gradient(circle,rgba(216,86,224,.95),rgba(121,50,192,.62) 50%,transparent 70%)"></div>
    <div class="grain"></div><div class="vig"></div>
    <div class="pad" style="align-items:flex-start">
      ${mark(true)}
      <h2 class="head" style="font-size:8.6cqw">This carousel was made by Blink&nbsp;UGC.</h2>
      <p class="body" style="margin-top:4cqw">Make these carousels for your brand too.</p>
      <div style="flex:1"></div>
      <span class="pill accent">Free to try &middot; blinkugc.com</span>
    </div>`,
]

export const SLIDE_COUNT = LAYOUTS.length

/** The HTML for one slide. Exported so a change can be eyeballed without Chrome. */
export function slideHtml(index, copy) {
  const layout = LAYOUTS[index]
  if (!layout) throw new Error(`No layout for slide ${index}`)
  return `<!doctype html><meta charset="utf-8"><style>${SHEET}</style>` +
    `<div class="slide">${layout(copy)}</div>`
}

/**
 * Render every slide to a PNG buffer, in order.
 *
 * One Chrome process per slide. Slower than a persistent browser over a
 * DevTools socket, but a daily job has all the time in the world and a process
 * that exits cannot leak one — which is the failure that would otherwise show
 * up six weeks in as a laptop with forty zombie Chromes on it.
 */
export async function renderSlides(copies) {
  const dir = await mkdtemp(join(tmpdir(), 'blink-carousel-'))
  try {
    const out = []
    for (let i = 0; i < copies.length; i++) {
      const html = join(dir, `slide-${i}.html`)
      const png = join(dir, `slide-${i}.png`)
      await writeFile(html, slideHtml(i, copies[i]), 'utf8')
      await run(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--window-size=${SLIDE_W},${SLIDE_H}`,
        `--screenshot=${png}`,
        // Fonts are inlined, so nothing is on the network — this is purely to
        // let layout and the blur filters settle before the capture.
        '--virtual-time-budget=3000',
        `file://${html}`,
      ]).catch((err) => {
        throw new Error(
          `Chrome failed to render slide ${i + 1}. Is it installed at ${CHROME}? ` +
            `Set CHROME_BIN to override. (${err.message})`
        )
      })
      out.push(await readFile(png))
    }
    return out
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

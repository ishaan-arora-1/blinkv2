import { buildPreset } from './copygen.js'

/**
 * Finished work, shown on the landing page.
 *
 * The page used to show the *inputs* — photo-set strips on one side, copy-angle
 * quotes on the other — and never the two composited, which is the thing the
 * product actually exports. These are the output.
 *
 * Each slide is either `{ img }`, pointing at a real exported PNG under
 * /public/showcase, or `{ bg, dim, texts }`, composed here from the real copy
 * generator over a built-in photo. SlidePreview renders both the same way, so
 * dropping in real exports is a change to this file and nothing else.
 *
 * Two different brands on purpose: the generator is not app-specific, and a
 * skincare carousel next to a gym one says that faster than a sentence can.
 */

const thumb = (set, n) => `/sets/thumbs/${set}/${n}.jpg`

/*
 * Mirrors newTextLayer and buildCarousel in src/pages/Carousels.jsx — same
 * defaults, same slide geometry, minus the ids, which only matter once a
 * carousel is saved. Those two are the source of truth: if the real layout
 * moves, move it here too, or the page starts advertising a composition the
 * product no longer makes.
 */
const layer = (patch) => ({
  x: 50, y: 50, size: 24, weight: 800, color: '#ffffff',
  align: 'center', width: 82, font: 'body', upper: false, pill: 'none', ...patch,
})

/**
 * Hook, first body slide and CTA — enough to read as a carousel without
 * showing all five and shrinking every slide past legibility.
 */
function compose(brand, presetId, imgs) {
  const copy = buildPreset(brand, presetId)
  const body = copy.bodies[0]
  const handle = `@${brand.appName.toLowerCase().replace(/\s+/g, '')}`

  return [
    {
      bg: imgs[0], dim: 0.5,
      texts: [
        layer({ text: copy.hook, y: 46, size: 30, font: 'display', width: 86 }),
        layer({ text: handle, y: 90, size: 13, weight: 500, color: '#e6e6e6' }),
        layer({ text: 'swipe →', y: 96, size: 11, weight: 500, color: '#cccccc' }),
      ],
    },
    {
      bg: imgs[1], dim: 0.5,
      texts: [
        layer({ text: '01', y: 26, size: 15, font: 'serif', color: 'var(--pill-accent)', weight: 500 }),
        layer({ text: body.h, y: 42, size: 26, font: 'display', width: 84 }),
        layer({ text: body.s, y: 60, size: 15, weight: 500, color: '#e9e9e9', width: 74 }),
      ],
    },
    {
      bg: imgs[2], dim: 0.45,
      texts: [
        layer({ text: copy.cta.h, y: 42, size: 28, font: 'display', width: 84 }),
        layer({ text: copy.cta.s, y: 58, size: 15, weight: 600, pill: 'accent', color: '#101010', width: 70 }),
      ],
    },
  ]
}

const AURELIA = {
  appName: 'Aurelia',
  category: 'skincare',
  verb: 'stick to a routine',
  tagline: 'The three-step routine you will actually finish.',
}

const NORTHBOUND = {
  appName: 'Northbound',
  category: 'gym gear',
  verb: 'train',
  tagline: 'Kit that survives the session.',
}

export const SHOWCASE = [
  {
    id: 'aurelia',
    name: 'Aurelia',
    category: 'Skincare',
    angle: 'Bold claim',
    accent: '#f3a4e6',
    slideCount: 5,
    // The hook slide leads the hero, so it takes the photo with the most
    // contrast in it: the pastel flat-lay goes flat and grey under the 50%
    // dim every hook slide carries.
    slides: compose(AURELIA, 'bold_claim', [
      thumb('girl', '02'),
      thumb('girl', '09'),
      thumb('girl', '04'),
    ]),
  },
  {
    id: 'northbound',
    name: 'Northbound',
    category: 'Gym gear',
    angle: 'Gatekept gem',
    accent: '#c9a4ff',
    slideCount: 5,
    slides: compose(NORTHBOUND, 'gatekeep', [
      thumb('gym', '02'),
      thumb('gym', '08'),
      thumb('gym', '05'),
    ]),
  },
]

/** The opening slide of each showcase, for the hero. */
export const heroSlides = () => SHOWCASE.map((c) => ({ ...c.slides[0], accent: c.accent, name: c.name }))

/**
 * Animated carousels, shown on the landing page.
 *
 * Real exports rather than compositions, which is the `{ img }` case the
 * docstring above describes: these came out of the product at 1080 × 1350 with
 * the text already burnt in, so there is nothing left to compose. They are
 * downscaled to 540px and JPEG'd — six full-size PNGs is ten megabytes to
 * render one section of a first visit.
 *
 * Hook, a middle slide and the CTA, same three-of-five as SHOWCASE. The middle
 * one is slide three rather than two on purpose: it is where the pose has
 * travelled furthest from the hook's, which is the claim this section makes —
 * one character, a different action per slide, drawn from that slide's words.
 */
export const ANIMATED_SHOWCASE = [
  {
    id: 'muscleblaze',
    name: 'MuscleBlaze',
    category: 'Protein',
    character: 'Athlete',
    slideCount: 5,
    slides: [
      { img: '/showcase/animated/muscleblaze-hook.jpg' },
      { img: '/showcase/animated/muscleblaze-body.jpg' },
      { img: '/showcase/animated/muscleblaze-cta.jpg' },
    ],
  },
  {
    id: 'blink',
    name: 'Blink UGC',
    category: 'Marketing',
    character: 'Robot',
    slideCount: 5,
    slides: [
      { img: '/showcase/animated/blink-hook.jpg' },
      { img: '/showcase/animated/blink-body.jpg' },
      { img: '/showcase/animated/blink-cta.jpg' },
    ],
  },
]

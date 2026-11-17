/**
 * Every real output we can show, in one list.
 *
 * Two sources, both ours to show. The `ugc-*` clips are client work Blink was
 * involved in producing; the rest came straight out of the product — three
 * standalone clips, the scenes and final cuts of two multi-scene reels, and
 * the drawn frames those reels were filmed from.
 *
 * Captions name the category, not the brand. A wall of work is ours to show; a
 * wall of logos says those companies endorse us, which is a different claim and
 * not one the footage makes.
 *
 * `seconds` is measured off the file with ffprobe, not estimated. The gallery
 * prints it on the card, so a wrong number here is a small lie on the page.
 *
 * Re-encoded to 360px and silent under /outputs — the galleries play a couple
 * of dozen at once, and the originals were forty megabytes with audio nobody
 * can hear over twenty-three other clips. Three carry an `hd` cut with sound.
 */
const clip = (id, label, seconds, opts = {}) => ({
  id,
  label,
  seconds,
  src: `/outputs/clips/${id}.mp4`,
  poster: `/outputs/posters/${id}.jpg`,
  ...opts,
})

/** `blink` marks a clip Blink AI planned, drew and filmed as part of a reel. */
const B = { kind: 'blink' }

/**
 * Nothing on this list may carry a generator's watermark.
 *
 * Every scene of the two Blink AI reels (`mf-*`, `story-*`) and the action
 * camera spot (`ugc-07`) were filmed on Veo and carry Google's Gemini sparkle
 * in the bottom-right corner. A landing page arguing "not generated" cannot
 * show a vendor's AI watermark, so they were taken off on 2026-11-17. The
 * files are still under /outputs; check the corner of anything added back.
 */

/** The three that carry the hero. */
export const FEATURED = [
  clip('ugc-03', 'Beverage', 20, { hd: '/outputs/clips/ugc-03-hd.mp4' }),
  clip('ugc-08', 'Earbuds', 10, { hd: '/outputs/clips/ugc-08-hd.mp4' }),
  clip('ugc-10', 'Jewellery', 26),
]

/** Creator to camera: a person holding, wearing or talking about the thing. */
export const UGC = [
  clip('ugc-08', 'Earbuds review', 10),
  clip('ugc-01', 'Street style', 21),
  clip('blink-unboxing', 'Unboxing', 5, B),
  clip('ugc-05', 'Nail care', 13),
  clip('blink-podcast', 'Podcast plug', 10, B),
  clip('ugc-04', 'Hospitality', 10),
]

/** Product film: the thing itself, lit and moving. */
export const PRODUCT = [
  clip('ugc-03', 'Beverage hero', 20),
  clip('ugc-10', 'Jewellery', 26),
  clip('blink-studio', 'Studio spin', 5, B),
  clip('ugc-09', 'Campaign still', 6),
  clip('ugc-02', 'Out of home', 10),
  clip('ugc-06', 'Billboard', 10),
]

/** The two finished, narrated, subtitled cuts. */
export const FINISHED = [
  {
    id: 'mf-final',
    label: 'Creator reel',
    seconds: 21,
    scenes: 5,
    src: '/multiframe/final.mp4',
    poster: '/multiframe/final-poster.jpg',
  },
  {
    id: 'story-final',
    label: 'Product reel',
    seconds: 29,
    scenes: 5,
    src: '/story/final.mp4',
    poster: '/story/final-poster.jpg',
  },
]

/** Kept for anything that still wants one flat list of the moving work. */
export const OUTPUTS = [...UGC, ...PRODUCT]

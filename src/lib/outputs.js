/**
 * Every real output we can show, in one list.
 *
 * Two sources, both ours to show. The `ugc-*` clips are client work Blink was
 * involved in producing; the rest came straight out of the product — three
 * standalone Blink AI clips, and the scenes and final cuts of two multi-scene
 * reels. Nothing here is stock or scraped.
 *
 * Captions name the category, not the brand. A wall of work is ours to show; a
 * wall of logos says those companies endorse us, which is a different claim and
 * not one the footage makes.
 *
 * Re-encoded to 360px and silent under /outputs — the wall plays two dozen at
 * once, and the originals were forty megabytes with audio nobody can hear over
 * twenty-four other clips. Three carry an `hd` cut with sound for the hero.
 */
const clip = (id, label, opts = {}) => ({
  id,
  label,
  src: `/outputs/clips/${id}.mp4`,
  poster: `/outputs/posters/${id}.jpg`,
  ...opts,
})

/** The three that carry the hero: sound on, 540px, shot like commercials. */
export const FEATURED = [
  clip('ugc-03', 'Beverage', { hd: '/outputs/clips/ugc-03-hd.mp4' }),
  clip('ugc-08', 'Earbuds', { hd: '/outputs/clips/ugc-08-hd.mp4' }),
  clip('ugc-07', 'Action camera', { hd: '/outputs/clips/ugc-07-hd.mp4' }),
]

/**
 * The wall. Ordered so the eye never lands on two of the same kind of shot
 * side by side — a product hero, then a face, then a place, then a still.
 */
export const OUTPUTS = [
  clip('ugc-03', 'Beverage'),
  clip('ugc-08', 'Earbuds'),
  clip('ugc-02', 'Out of home'),
  clip('mf-01-hallway', 'Creator · hallway'),
  clip('ugc-05', 'Nail care'),
  clip('ugc-07', 'Action camera'),
  clip('ugc-01', 'Street style'),
  clip('story-01', 'Supplement · mirror'),
  clip('ugc-10', 'Jewellery'),
  clip('mf-04-street', 'Creator · street'),
  clip('ugc-04', 'Hospitality'),
  clip('blink-unboxing', 'Unboxing'),
  clip('ugc-09', 'Campaign still'),
  clip('mf-05-office', 'Creator · office'),
  clip('ugc-06', 'Billboard'),
  clip('blink-studio', 'Studio spin'),
  clip('story-03', 'Supplement · kitchen'),
  clip('mf-03-kitchen', 'Creator · kitchen'),
  clip('blink-podcast', 'Podcast plug'),
  clip('story-04', 'Supplement · desk'),
  clip('mf-02-bedroom', 'Creator · bedroom'),
  clip('story-02', 'Supplement · routine'),
  clip('story-05', 'Supplement · label'),
]

/** The two finished, narrated, subtitled cuts. */
export const FINISHED = [
  { id: 'mf-final', label: 'Creator reel', seconds: 21, src: '/multiframe/final.mp4', poster: '/multiframe/final-poster.jpg' },
  { id: 'story-final', label: 'Product reel', seconds: 29, src: '/story/final.mp4', poster: '/story/final-poster.jpg' },
]

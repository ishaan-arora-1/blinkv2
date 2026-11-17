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

/** The three that carry the hero: sound on, 540px, shot like commercials. */
export const FEATURED = [
  clip('ugc-03', 'Beverage', 20, { hd: '/outputs/clips/ugc-03-hd.mp4' }),
  clip('ugc-08', 'Earbuds', 10, { hd: '/outputs/clips/ugc-08-hd.mp4' }),
  clip('ugc-07', 'Action camera', 10, { hd: '/outputs/clips/ugc-07-hd.mp4' }),
]

/**
 * Creator to camera: a person holding, wearing or talking about the thing.
 * The `mf-*` and `story-*` entries are individual scenes out of the two reels
 * further down the page, which is why they carry the Blink AI mark.
 */
export const UGC = [
  clip('mf-01-hallway', 'Hallway selfie', 6, B),
  clip('ugc-01', 'Street style', 21),
  clip('story-01', 'Supplement · mirror', 4, B),
  clip('blink-unboxing', 'Unboxing', 5, B),
  clip('mf-04-street', 'Walk and talk', 6, B),
  clip('ugc-05', 'Nail care', 13),
  clip('story-02', 'Morning routine', 8, B),
  clip('mf-05-office', 'At the desk', 6, B),
  clip('blink-podcast', 'Podcast plug', 10, B),
  clip('story-04', 'Desk read', 8, B),
  clip('mf-03-kitchen', 'Kitchen counter', 4, B),
  clip('ugc-04', 'Hospitality', 10),
  clip('story-03', 'Kitchen pour', 4, B),
  clip('mf-02-bedroom', 'Bedroom vlog', 6, B),
  clip('story-05', 'Label close-up', 6, B),
]

/** Product film: the thing itself, lit and moving, with nobody in the frame. */
export const PRODUCT = [
  clip('ugc-03', 'Beverage hero', 20),
  clip('ugc-08', 'Earbuds', 10),
  clip('ugc-07', 'Action camera', 10),
  clip('ugc-10', 'Jewellery', 26),
  clip('blink-studio', 'Studio spin', 5, B),
  clip('ugc-09', 'Campaign still', 6),
  clip('ugc-02', 'Out of home', 10),
  clip('ugc-06', 'Billboard', 10),
]

/**
 * Stills, every one generated.
 *
 * These are not posters pulled off the videos — they are the frames Blink drew
 * before anything was filmed, which is the whole trick: the frame is approved
 * first and the video is made from it. The last three are standalone stills.
 */
const still = (src, label) => ({ id: src, src, label })

export const STATICS = [
  still('/multiframe/frames/01-hallway.jpg', 'Hallway'),
  still('/story/frames/s1-a.jpg', 'Mirror'),
  still('/multiframe/frames/04-street.jpg', 'Street'),
  still('/story/frames/s2-a.jpg', 'Counter'),
  still('/blink/stills/office-desk.jpg', 'Desk'),
  still('/story/frames/s1-c.jpg', 'Bathroom'),
  still('/multiframe/frames/03-kitchen.jpg', 'Kitchen'),
  still('/story/frames/s3-a.jpg', 'Pour'),
  still('/blink/stills/street-walk.jpg', 'Walking'),
  still('/story/frames/s2-c.jpg', 'Hands'),
  still('/multiframe/frames/05-office.jpg', 'Office'),
  still('/story/frames/s4-a.jpg', 'Label'),
  still('/blink/stills/hallway-selfie.jpg', 'Selfie'),
  still('/story/frames/s1-b.jpg', 'Shelf'),
  still('/multiframe/frames/02-bedroom.jpg', 'Bedroom'),
  still('/story/frames/s5-a.jpg', 'Close'),
  still('/story/frames/s1-d.jpg', 'Reach'),
  still('/story/frames/s2-b.jpg', 'Open'),
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

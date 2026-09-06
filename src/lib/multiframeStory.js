/**
 * One real multi-frame generation, for the landing page.
 *
 * Named to sit beside reelStory.js, not lib/multiframe.js: that one is the
 * feature — the calls that start a reel, redraw a frame and save a cut. This is
 * only the finished evidence of one run, frozen as files under /multiframe.
 *
 * ReelGraph proves the pipeline on a product ad — a bottle on a table, drawn
 * and filmed. This is the other half of the same claim and the harder one: a
 * person, held across five places, in one video. A graph is the wrong shape for
 * that. The evidence is simply the pictures in the order they were cut, so the
 * section is a filmstrip rather than a diagram.
 *
 * Ordered as the final cuts them, not as they were generated. A strip that runs
 * in a different order than the video beneath it is a strip the video
 * contradicts the moment anybody presses play.
 */
export const MF_SCENES = [
  { id: '01-hallway', place: 'Hallway', seconds: 6 },
  { id: '02-bedroom', place: 'Bedroom', seconds: 6 },
  { id: '03-kitchen', place: 'Kitchen', seconds: 4 },
  { id: '04-street', place: 'Street', seconds: 6 },
  { id: '05-office', place: 'Office', seconds: 6 },
]

/**
 * `seconds` is each clip's real length, and it earns its place twice: a scene
 * is chosen at a length, so the strip should say which — and the badge sits
 * exactly where Veo burns its sparkle into the bottom-right of every generated
 * clip. One label, and the corner stops advertising somebody else.
 *
 * The frames and the final cut carry no such mark, so neither carries a badge.
 */

/** The drawn frame — the still, before anything moved. */
export const mfFrame = (id) => `/multiframe/frames/${id}.jpg`

/**
 * The filmed scene. Silent and 360px wide: these play at about a thumbnail's
 * size and only when pointed at, so the audio track and the other 700 pixels
 * were bytes nobody could perceive.
 */
export const mfClip = (id) => ({
  src: `/multiframe/clips/${id}.mp4`,
  poster: `/multiframe/posters/${id}.jpg`,
})

/**
 * The cut, and the only asset here that keeps its sound — the voiceover and the
 * subtitles timed to it are half of what this section claims, and a silent
 * final would be evidence for the wrong thing.
 */
export const MF_FINAL = {
  src: '/multiframe/final.mp4',
  poster: '/multiframe/final-poster.jpg',
  seconds: 21,
}

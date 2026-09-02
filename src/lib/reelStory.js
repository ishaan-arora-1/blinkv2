/**
 * One real Blink AI generation, as a graph.
 *
 * The `#blink` section used to make its case in a bullet list — one person
 * across every scene, your product held identical, one voice over the top —
 * and illustrate it with three unrelated clips. The claim the page leads on
 * was the one thing it never showed.
 *
 * This is that generation instead: the brief that was typed, the frame each
 * scene was drawn as, the looks it was redrawn into, the clip each frame
 * became, the script, the voice, and the finished cut. Nothing here is a
 * mock-up, and there is deliberately almost no prose — the pictures are the
 * argument.
 *
 * Everything under /public/story is re-encoded from the originals: frames at
 * 600px, clips at 480px and silent, the final cut at 608px with its audio. The
 * whole set is 4.4 MB, and the clips are not fetched until the graph scrolls
 * into view.
 *
 * To feature a different generation, replace the files and this file. Nothing
 * in ReelGraph.jsx knows anything about Bellway.
 */

/** The brand whose reel this is, as it was set up in the product profile. */
export const BRAND = {
  name: 'Bellway',
  product: 'Super Fiber',
  productImg: '/story/product.jpg',
}

/** What was typed into the composer, and the settings it was run with. */
export const BRIEF = {
  idea:
    'A woman catches herself bloated in the mirror, starts mixing Bellway Super Fiber ' +
    'into water every morning, and ends up back in the clothes she loves.',
  sceneCount: 5,
  aspectRatio: '9:16',
}

/**
 * The scenes, top to bottom down the graph.
 *
 * This is the order the graph reads them in, which is the arc of the ad: the
 * problem, the product, the habit, the payoff, the call to action. The finished
 * cut plays the last two the other way round.
 *
 * `frames` is every still drawn for that scene: the planner's draft, then each
 * redraw with the instruction that produced it. Two scenes carry more than one,
 * and they are laid out overlapping side by side, which is the shortest way to
 * say that four pictures are one shot in four outfits.
 *
 * A frame only belongs here if it is the same shot wearing something else. A
 * redraw that moved the camera somewhere else in the room is a different shot,
 * and listing it as a look made one frame read as two.
 *
 * The still marked `chosen` is the one that went on to be filmed.
 */
export const SCENES = [
  {
    id: 's1',
    title: 'The mirror',
    seconds: 7.5,
    frames: [
      { id: 's1-a', instruction: null, chosen: true },
      { id: 's1-b', instruction: 'Woman shifting hand to abdomen' },
      { id: 's1-c', instruction: 'Change clothes to pyjamas' },
      { id: 's1-d', instruction: 'Change clothes to yellow dress' },
    ],
  },
  {
    id: 's3',
    title: 'The product',
    seconds: 7.8,
    frames: [{ id: 's3-a', instruction: 'Change clothes to pyjama shirt', chosen: true }],
  },
  {
    id: 's2',
    title: 'The routine',
    seconds: 5.1,
    frames: [
      { id: 's2-a', instruction: 'Change camera angle and distance', chosen: true },
      { id: 's2-b', instruction: 'Change girl clothes to pyjama' },
      { id: 's2-c', instruction: 'Change girl clothing' },
    ],
  },
  {
    id: 's4',
    title: 'Her clothes',
    seconds: 4.9,
    frames: [{ id: 's4-a', instruction: 'Modify woman clothing and appearance', chosen: true }],
  },
  {
    id: 's5',
    title: 'The smile',
    seconds: 4,
    frames: [{ id: 's5-a', instruction: null, chosen: true }],
  },
]

/** Where a still and its clip live, derived from the frame id. */
export const frameSrc = (id) => `/story/frames/${id}.jpg`
export const clipSrc = (id) => ({ src: `/story/clips/${id}.mp4`, poster: `/story/posters/${id}.jpg` })

/** The still that was filmed, for a scene. */
export const chosenFrame = (scene) => scene.frames.find((f) => f.chosen) || scene.frames[0]

/**
 * The voiceover the model wrote for these five shots, in one pass with the
 * scene split — which is why it narrates the arc rather than captioning it.
 */
export const SCRIPT =
  'Have you ever had one of those days where you have the perfect outfit picked out, ' +
  'but your bloating has other plans? It happened with me as well. That’s when I ' +
  'started adding Bellway Superfiber to my regular routine. It became such an easy ' +
  'part of my day, and over time, I noticed I was feeling less bloated and more ' +
  'comfortable. And now I’m back in the clothes I love without feeling like bloating ' +
  'is getting in the way. Bellway Superfiber has become a simple part of my daily ' +
  'routine, and honestly, I love how much better I feel. Bellway Superfiber — make ' +
  'fiber part of your routine.'

/** Who read it. One of the eight narrators. */
export const NARRATOR = 'Rachel'

/**
 * The narration's own loudness, thirty-two buckets of it.
 *
 * Measured off the finished cut's audio rather than drawn, so the gaps in the
 * bars on the voice node are the pauses you can hear when you press play.
 */
export const PEAKS = [
  0.81, 0.73, 0.51, 0.31, 0.66, 0.39, 0.49, 0.36, 0.73, 0.8, 0.74, 0.32, 0.75, 0.8, 0.76, 0.75,
  0.69, 0.52, 0.88, 0.85, 0.82, 0.52, 0.85, 0.69, 0.93, 0.76, 0.96, 0.51, 0.85, 0.3, 1.0, 0.74,
]

/** The finished video — the only thing in the graph with sound. */
export const FINAL = {
  src: '/story/final.mp4',
  poster: '/story/final-poster.jpg',
  seconds: 29,
  /** The silent cut, the narrated one and the subtitled one are all kept. */
  versions: 3,
}

/** m:ss, for the node labels. */
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

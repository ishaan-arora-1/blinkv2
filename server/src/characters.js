/**
 * The character archetypes an animated carousel can be built around.
 *
 * The browser sends an id from this list and nothing else. It never sends the
 * brief — same reasoning as CREATOR_IMAGES in veo.js: anything the client can
 * put straight into a generation prompt is an injection surface, and here it
 * would also let a caller quietly swap the art style the product is selling.
 * The topic is free text, but it arrives as *subject matter*, wrapped by a
 * brief that this file controls.
 *
 * `brief` describes the character precisely enough that slide 1 comes back the
 * same way twice. Every later slide is conditioned on slide 1's image rather
 * than on this text, so the brief only has to be good once.
 *
 * Mirrored for display in src/lib/characters.js — names and blurbs only. If an
 * id changes here it must change there too, or the picker sends an id the
 * server rejects.
 */
export const CHARACTERS = [
  {
    id: 'ch_kid_3d',
    name: 'Cartoon kid',
    blurb: 'Bright, friendly, all-ages',
    brief:
      'a cheerful 3D-rendered teenage boy with dark tousled hair, wearing a hoodie over a white tee ' +
      'and dark jeans, big expressive eyes, warm approachable smile',
  },
  {
    id: 'ch_mascot_bird',
    name: 'Mascot bird',
    blurb: 'Bold brand-mascot energy',
    brief:
      'a confident 3D-rendered cartoon eagle mascot standing upright on two legs, white head feathers, ' +
      'bright yellow beak, brown wings, wearing a fitted team t-shirt, heroic friendly expression',
  },
  {
    id: 'ch_pro_woman',
    name: 'Professional',
    blurb: 'Credible, B2B-friendly',
    brief:
      'a poised 3D-rendered woman in her early thirties with a dark bob, wearing a tailored blazer ' +
      'over a simple top, calm confident expression',
  },
  {
    id: 'ch_everyday_woman',
    name: 'Everyday woman',
    blurb: 'Warm and relatable',
    brief:
      'a friendly 3D-rendered young woman with curly auburn hair tied in a bun, wearing a soft ' +
      'knit cardigan over a white tee, warm genuine smile',
  },
  {
    id: 'ch_athlete',
    name: 'Athlete',
    blurb: 'Energetic, fitness and food',
    brief:
      'an energetic 3D-rendered athletic man in his late twenties with a short fade haircut, ' +
      'wearing a fitted training top and shorts, strong upbeat posture',
  },
  {
    id: 'ch_blob',
    name: 'Friendly creature',
    blurb: 'Playful, no human likeness',
    brief:
      'a rounded 3D-rendered cartoon creature mascot with a soft jellybean body, stubby arms and legs, ' +
      'two large friendly eyes and a small smile, no hair, no clothing',
  },
  {
    id: 'ch_senior',
    name: 'Trusted elder',
    blurb: 'Health, finance, insurance',
    brief:
      // No "laugh lines" here, however natural it reads: fal's content checker
      // rejects the phrase outright and takes the whole generation with it.
      'a warm 3D-rendered woman in her sixties with a short silver bob and glasses, wearing a soft ' +
      'teal blouse and a light cardigan, kind reassuring expression',
  },
  {
    id: 'ch_dog',
    name: 'Mascot dog',
    blurb: 'Consumer, pets, food',
    brief:
      'a happy 3D-rendered cartoon golden retriever mascot standing upright on two legs, fluffy ' +
      'golden fur, floppy ears, wearing a small buttoned collar bandana, tongue out in a friendly grin',
  },
  {
    id: 'ch_robot',
    name: 'Robot',
    blurb: 'Apps, SaaS, anything technical',
    brief:
      'a friendly 3D-rendered rounded robot mascot with a smooth matte-white shell, a single wide ' +
      'glowing cyan visor for a face, small floating spherical hands, stubby legs, no mouth',
  },
  {
    id: 'ch_chef',
    name: 'Chef',
    blurb: 'Food, drink, restaurants',
    brief:
      'a cheerful 3D-rendered chef in his forties with a dark moustache and a light stubble, wearing ' +
      'a white double-breasted chef jacket and a folded navy bandana, warm proud expression',
  },
]

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || null

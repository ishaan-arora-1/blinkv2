/**
 * Real Blink AI output, for the landing page hero.
 *
 * Stills rather than clips. The three tiles are ~125px wide inside
 * `.lp-wall.narrow`, which is too small for motion to read as anything but
 * flicker, and the clips they replaced cost several megabytes and a hover
 * before a first visit saw anything move at all. A frame that is legible
 * immediately sells the output better than a video nobody hovers.
 *
 * One creator across three settings, on purpose: the thing this page claims is
 * that Blink AI holds the same person from scene to scene, and three unrelated
 * faces would be the one arrangement of these tiles that fails to show it.
 */
export const BLINK_TEMPLATES = [
  {
    id: 'blink_hallway_selfie',
    name: 'Hallway selfie',
    img: '/blink/stills/hallway-selfie.jpg',
    alt: 'Blink AI still — creator filming a mirror selfie in a sunlit hallway',
  },
  {
    id: 'blink_office_desk',
    name: 'Office desk',
    img: '/blink/stills/office-desk.jpg',
    alt: 'Blink AI still — the same creator at a desk in an open-plan office',
  },
  {
    id: 'blink_street_walk',
    name: 'Street walk',
    img: '/blink/stills/street-walk.jpg',
    alt: 'Blink AI still — the same creator filming to camera on a suburban street',
  },
]

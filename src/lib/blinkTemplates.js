/**
 * Real Blink AI output, for the landing page.
 *
 * The section used to illustrate prompt-to-video with three premade creator
 * hook clips — the one part of the page that was not just repetitive but
 * inaccurate, since Veo generated none of them. These are actual generations.
 *
 * Same shape as a creator hook, so HookPreview renders them unchanged: the
 * clips are several megabytes each and carry `preload="none"`, so nothing is
 * fetched until someone hovers one and the ~25 KB poster is all a first visit
 * pays for.
 */
export const BLINK_TEMPLATES = [
  {
    id: 'blink_podcast_plug',
    name: 'Podcast plug',
    src: '/blink/podcast-plug.mp4',
    poster: '/blink/posters/podcast-plug.jpg',
  },
  {
    id: 'blink_studio_spin',
    name: 'Studio spin',
    src: '/blink/studio-spin.mp4',
    poster: '/blink/posters/studio-spin.jpg',
  },
  {
    id: 'blink_unboxing_asmr',
    name: 'Unboxing ASMR',
    src: '/blink/unboxing-asmr.mp4',
    poster: '/blink/posters/unboxing-asmr.jpg',
  },
]

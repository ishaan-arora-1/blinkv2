// Blink UGC's AI creator roster — real portraits + premade 3s hook clips,
// generated with Seedream 4 (portraits) and Seedance 1.0 Pro (hooks),
// shipped as local assets under /public/creators and /public/hooks.

const hook = (creatorSlug, ab, emotion, label) => ({
  id: `hk_${creatorSlug}_${ab}`,
  src: `/hooks/${creatorSlug}-${ab}.mp4`,
  emotion,
  label,
  maxDuration: 3,
})

export const CREATORS = [
  {
    id: 'cr_tech_guy', name: 'Ethan', vibe: 'Tech guy', img: '/creators/tech-guy.jpg',
    hooks: [hook('tech-guy', 'a', 'gasp', 'Shocked gasp'), hook('tech-guy', 'b', 'headshake', 'Disbelief head-shake')],
  },
  {
    id: 'cr_tech_girl', name: 'Nina', vibe: 'Tech girl', img: '/creators/tech-girl.jpg',
    hooks: [hook('tech-girl', 'a', 'mindblown', 'Mind-blown'), hook('tech-girl', 'b', 'excited-nod', 'Excited nodding')],
  },
  {
    id: 'cr_gym_guy', name: 'Jake', vibe: 'Gym guy', img: '/creators/gym-guy.jpg',
    hooks: [hook('gym-guy', 'a', 'point', 'Points at camera'), hook('gym-guy', 'b', 'nod', 'Approving nod')],
  },
  {
    id: 'cr_gym_girl', name: 'Lena', vibe: 'Gym girl', img: '/creators/gym-girl.jpg',
    hooks: [hook('gym-girl', 'a', 'gasp', 'Shocked gasp'), hook('gym-girl', 'b', 'smile-burst', 'Excited smile')],
  },
  {
    id: 'cr_casual_guy', name: 'Sam', vibe: 'Everyday guy', img: '/creators/casual-guy.jpg',
    hooks: [hook('casual-guy', 'a', 'headshake', 'Disbelief head-shake'), hook('casual-guy', 'b', 'jawdrop', 'Jaw drop')],
  },
  {
    id: 'cr_casual_girl', name: 'Chloe', vibe: 'Everyday girl', img: '/creators/casual-girl.jpg',
    hooks: [hook('casual-girl', 'a', 'gasp-hand', 'Gasp, hand to mouth'), hook('casual-girl', 'b', 'giggle', 'Warm giggle')],
  },
  {
    id: 'cr_older_woman', name: 'Susan', vibe: 'Trustworthy — 55+', img: '/creators/older-woman.jpg',
    hooks: [hook('older-woman', 'a', 'surprised-oh', 'Surprised “oh!”'), hook('older-woman', 'b', 'warm-nod', 'Reassuring nod')],
  },
  {
    id: 'cr_older_man', name: 'Frank', vibe: 'Trustworthy — 60+', img: '/creators/older-man.jpg',
    hooks: [hook('older-man', 'a', 'eyebrow', 'Impressed eyebrows'), hook('older-man', 'b', 'slow-nod', 'Slow approving nod')],
  },
  {
    id: 'cr_business_woman', name: 'Diana', vibe: 'Professional', img: '/creators/business-woman.jpg',
    hooks: [hook('business-woman', 'a', 'skeptical', 'Skeptical eyebrow'), hook('business-woman', 'b', 'confident-nod', 'Confident nod')],
  },
  {
    id: 'cr_dad_guy', name: 'Mike', vibe: 'Dad energy', img: '/creators/dad-guy.jpg',
    hooks: [hook('dad-guy', 'a', 'double-take', 'Surprised double take'), hook('dad-guy', 'b', 'relieved', 'Relieved smile')],
  },
]

export function getCreator(id) {
  return CREATORS.find((c) => c.id === id)
}

export function getHook(creatorId, hookId) {
  return getCreator(creatorId)?.hooks.find((h) => h.id === hookId)
}

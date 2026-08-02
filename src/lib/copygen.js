// Carousel copy presets.
// Each preset is a complete carousel angle — hook, body slides, CTA — written
// from the brand profile. The user picks one by its hook line.

export function brandContext(brand) {
  const verb = brand.verb?.trim() || 'get things done'
  return {
    app: brand.appName?.trim() || 'MyApp',
    cat: brand.category?.trim() || 'productivity',
    verb,
    verbing: verb.endsWith('e') ? verb.slice(0, -1) + 'ing' : verb + 'ing',
    pitch: brand.tagline?.trim() || '',
  }
}

const PRESETS = [
  {
    id: 'bold_claim',
    name: 'Bold claim',
    build: (b) => ({
      hook: `${b.app} should honestly be illegal`,
      bodies: [
        { h: 'It does the boring part', s: `${b.app} handles the admin of ${b.verbing} so you just… do it.` },
        { h: 'Zero setup tax', s: 'Open it and you’re already going. No 20-minute onboarding.' },
        { h: 'It gets smarter', s: `The more you use it, the better it fits how you ${b.verb}.` },
      ],
      cta: { h: `Try ${b.app} free`, s: 'Download on the App Store — link in bio' },
    }),
  },
  {
    id: 'deleted_apps',
    name: 'Switch story',
    build: (b) => ({
      hook: `I deleted 6 apps after finding ${b.app}`,
      bodies: [
        { h: 'One app, not six', s: `Everything I used to juggle to ${b.verb} lives in one place now.` },
        { h: 'Nothing to maintain', s: 'No syncing, no tabs, no “where did I put that”.' },
        { h: 'My home screen thanks me', s: `${b.app} replaced a whole folder of half-used ${b.cat} apps.` },
      ],
      cta: { h: 'Clean up your home screen', s: `Get ${b.app} free on the App Store` },
    }),
  },
  {
    id: 'listicle',
    name: 'Listicle',
    build: (b) => ({
      hook: `3 ways ${b.app} quietly upgrades your day`,
      bodies: [
        { h: '01 · It remembers for you', s: `You stop keeping track of ${b.verbing} in your head.` },
        { h: '02 · It fits real life', s: 'Built for busy days, not perfect ones. Miss a day, it adapts.' },
        { h: '03 · It takes one tap', s: 'The thing you actually came to do is never more than a tap away.' },
      ],
      cta: { h: 'Your day, upgraded', s: `${b.app} is free on the App Store` },
    }),
  },
  {
    id: 'pov',
    name: 'POV',
    build: (b) => ({
      hook: `POV: you finally found a ${b.cat} app that works`,
      bodies: [
        { h: 'You open it', s: 'No ads. No upsell wall. Just the thing you came for.' },
        { h: 'You use it once', s: `And ${b.verbing} suddenly takes half as long.` },
        { h: 'You keep it', s: `Three weeks later ${b.app} is still on your home screen.` },
      ],
      cta: { h: 'Find out for yourself', s: `Search “${b.app}” on the App Store` },
    }),
  },
  {
    id: 'mistake',
    name: 'Contrarian take',
    build: (b) => ({
      hook: `What most ${b.cat} apps get wrong`,
      bodies: [
        { h: 'They want your attention', s: `${b.app} wants to give it back. Get in, ${b.verb}, get out.` },
        { h: 'They punish you', s: 'Streaks, guilt, red badges. None of that here.' },
        { h: 'They’re bloated', s: 'One job, done properly, instead of forty half-built features.' },
      ],
      cta: { h: `${b.app} does it differently`, s: 'Free on the App Store — link in bio' },
    }),
  },
  {
    id: 'before_after',
    name: 'Before / after',
    build: (b) => ({
      hook: `How I ${b.verb} in half the time now`,
      bodies: [
        { h: 'Before', s: `Scattered notes, five reminders, and still forgetting to ${b.verb}.` },
        { h: 'After', s: `${b.app} keeps the whole thing in one place, automatically.` },
        { h: 'The difference', s: 'Hours back every week, and a lot less thinking about it.' },
      ],
      cta: { h: 'Get your hours back', s: `Download ${b.app} on the App Store` },
    }),
  },
  {
    id: 'gatekeep',
    name: 'Gatekept gem',
    build: (b) => ({
      hook: `The ${b.cat} app your friends are gatekeeping`,
      bodies: [
        { h: 'Barely anyone knows it', s: `${b.app} has none of the marketing and all of the substance.` },
        { h: 'It just works', s: `No account needed. Open it and ${b.verb} straight away.` },
        { h: 'And it’s free', s: 'Which honestly makes no sense once you use it.' },
      ],
      cta: { h: 'Stop being gatekept', s: `${b.app} — free on the App Store` },
    }),
  },
  {
    id: 'stop_scroll',
    name: 'Pattern interrupt',
    build: (b) => ({
      hook: `Stop scrolling. This changes how you ${b.verb}.`,
      bodies: [
        { h: 'Ten seconds to set up', s: 'That’s genuinely the whole onboarding.' },
        { h: 'Then it disappears', s: `${b.app} works in the background so you don’t think about it.` },
        { h: 'You just feel it', s: 'Fewer dropped balls, less mental clutter, more done.' },
      ],
      cta: { h: 'Ten seconds. Try it.', s: `Get ${b.app} on the App Store` },
    }),
  },
  {
    id: 'objection',
    name: 'Skeptic converted',
    build: (b) => ({
      hook: `I didn't think I needed another ${b.cat} app`,
      bodies: [
        { h: 'I was wrong', s: `${b.app} isn’t another one — it replaced the ones I had.` },
        { h: 'It earned the space', s: `First ${b.cat} app I’ve kept past week one.` },
        { h: 'Now it’s a habit', s: `I don’t ${b.verb} without it anymore.` },
      ],
      cta: { h: 'Be skeptical. Then try it.', s: `${b.app} is free on the App Store` },
    }),
  },
  {
    id: 'nobody_talking',
    name: 'Hidden gem',
    build: (b) => ({
      hook: `Nobody is talking about this ${b.cat} app`,
      bodies: [
        { h: 'No ads, no hype', s: `${b.app} spread purely because people liked using it.` },
        { h: 'Built by people who care', s: 'It shows in every single screen.' },
        { h: 'Genuinely useful', s: b.pitch || `It makes ${b.verbing} feel effortless.` },
      ],
      cta: { h: 'Now you know', s: `Search “${b.app}” on the App Store` },
    }),
  },
]

// Preview list for the picker — just the hook line per preset
export function presetOptions(brand) {
  const b = brandContext(brand)
  return PRESETS.map((p) => ({ id: p.id, name: p.name, hook: p.build(b).hook }))
}

export function buildPreset(brand, presetId) {
  const b = brandContext(brand)
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0]
  return { ...preset.build(b), presetId: preset.id, presetName: preset.name }
}

// Blank scaffold for custom sets — user writes their own copy
export function blankCopy(brand) {
  const b = brandContext(brand)
  return {
    hook: 'Your hook goes here',
    bodies: [
      { h: 'Point one', s: 'Tap to edit this text.' },
      { h: 'Point two', s: 'Tap to edit this text.' },
      { h: 'Point three', s: 'Tap to edit this text.' },
    ],
    cta: { h: `Try ${b.app}`, s: 'Download on the App Store' },
    presetId: 'blank',
    presetName: 'Blank',
  }
}

// Re-roll just the hook, staying within the chosen preset's voice
export function regenerateHook(brand, presetId) {
  const b = brandContext(brand)
  const pool = PRESETS.filter((p) => p.id !== presetId)
  const pick = pool[Math.floor(Math.random() * pool.length)] || PRESETS[0]
  return pick.build(b).hook
}

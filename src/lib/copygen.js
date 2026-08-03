// Carousel copy presets.
// Each preset is a complete carousel angle — hook, body slides, CTA — written
// from the brand profile. The user picks one by its hook line.
//
// The copy is deliberately product-agnostic. It used to assume an iOS app in
// every line ("home screen", "another productivity app", "Download on the App
// Store"), which made every generated carousel wrong for a physical product, a
// SaaS tool or a store. The angles work the same; only the nouns were the
// problem. Preset ids are persisted on saved carousels, so they must not change.

export function brandContext(brand) {
  const verb = brand.verb?.trim() || 'get things done'
  return {
    name: brand.appName?.trim() || 'MyProduct',
    cat: brand.category?.trim() || 'productivity',
    verb,
    verbing: verb.endsWith('e') ? verb.slice(0, -1) + 'ing' : verb + 'ing',
    pitch: brand.tagline?.trim() || '',
  }
}

// Where to send people. Works for a store listing, a checkout or a signup —
// which is the point.
const LINK = 'Link in bio';

const PRESETS = [
  {
    id: 'bold_claim',
    name: 'Bold claim',
    build: (b) => ({
      hook: `${b.name} should honestly be illegal`,
      bodies: [
        { h: 'It does the boring part', s: `${b.name} handles the admin of ${b.verbing} so you just… do it.` },
        { h: 'Zero setup tax', s: 'Open it and you’re already going. No 20-minute onboarding.' },
        { h: 'It gets better', s: `The more you use it, the better it fits how you ${b.verb}.` },
      ],
      cta: { h: `Try ${b.name} free`, s: `${LINK} — takes a minute` },
    }),
  },
  {
    id: 'deleted_apps',
    name: 'Switch story',
    build: (b) => ({
      hook: `I replaced 6 things with ${b.name}`,
      bodies: [
        { h: 'One thing, not six', s: `Everything I used to juggle to ${b.verb} lives in one place now.` },
        { h: 'Nothing to maintain', s: 'No syncing, no tabs, no “where did I put that”.' },
        { h: 'I got the space back', s: `${b.name} replaced a whole shelf of half-used ${b.cat} stuff.` },
      ],
      cta: { h: 'Simplify the whole thing', s: `Get ${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'listicle',
    name: 'Listicle',
    build: (b) => ({
      hook: `3 ways ${b.name} quietly upgrades your day`,
      bodies: [
        { h: '01 · It remembers for you', s: `You stop keeping track of ${b.verbing} in your head.` },
        { h: '02 · It fits real life', s: 'Built for busy days, not perfect ones. Miss a day, it adapts.' },
        { h: '03 · It takes one step', s: 'The thing you actually came to do is never more than a step away.' },
      ],
      cta: { h: 'Your day, upgraded', s: `${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'pov',
    name: 'POV',
    build: (b) => ({
      hook: `POV: you finally found ${b.cat} that works`,
      bodies: [
        { h: 'You try it once', s: 'No ads. No upsell wall. Just the thing you came for.' },
        { h: 'It actually delivers', s: `And ${b.verbing} suddenly takes half as long.` },
        { h: 'You keep it', s: `Three weeks later you’re still using ${b.name} every day.` },
      ],
      cta: { h: 'Find out for yourself', s: `Look up ${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'mistake',
    name: 'Contrarian take',
    build: (b) => ({
      hook: `What most ${b.cat} brands get wrong`,
      bodies: [
        { h: 'They want your attention', s: `${b.name} wants to give it back. Get in, ${b.verb}, get out.` },
        { h: 'They overpromise', s: 'Big claims, thin product. None of that here.' },
        { h: 'They’re bloated', s: 'One job, done properly, instead of forty half-built ones.' },
      ],
      cta: { h: `${b.name} does it differently`, s: `See for yourself — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'before_after',
    name: 'Before / after',
    build: (b) => ({
      hook: `How I ${b.verb} in half the time now`,
      bodies: [
        { h: 'Before', s: `Scattered notes, five reminders, and still forgetting to ${b.verb}.` },
        { h: 'After', s: `${b.name} keeps the whole thing in one place, automatically.` },
        { h: 'The difference', s: 'Hours back every week, and a lot less thinking about it.' },
      ],
      cta: { h: 'Get your hours back', s: `Try ${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'gatekeep',
    name: 'Gatekept gem',
    build: (b) => ({
      hook: `The ${b.cat} find your friends are gatekeeping`,
      bodies: [
        { h: 'Barely anyone knows it', s: `${b.name} has none of the marketing and all of the substance.` },
        { h: 'It just works', s: `No learning curve. Start ${b.verbing} straight away.` },
        { h: 'And the price is silly', s: 'Which honestly makes no sense once you’ve tried it.' },
      ],
      cta: { h: 'Stop being gatekept', s: `${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'stop_scroll',
    name: 'Pattern interrupt',
    build: (b) => ({
      hook: `Stop scrolling. This changes how you ${b.verb}.`,
      bodies: [
        { h: 'Ten seconds to start', s: 'That’s genuinely the whole setup.' },
        { h: 'Then it disappears', s: `${b.name} works quietly so you don’t think about it.` },
        { h: 'You just feel it', s: 'Fewer dropped balls, less mental clutter, more done.' },
      ],
      cta: { h: 'Ten seconds. Try it.', s: `Get ${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'objection',
    name: 'Skeptic converted',
    build: (b) => ({
      hook: `I didn't think I needed another ${b.cat} thing`,
      bodies: [
        { h: 'I was wrong', s: `${b.name} isn’t another one — it replaced the ones I had.` },
        { h: 'It earned the space', s: `First ${b.cat} buy I’ve kept past week one.` },
        { h: 'Now it’s a habit', s: `I don’t ${b.verb} without it anymore.` },
      ],
      cta: { h: 'Be skeptical. Then try it.', s: `${b.name} — ${LINK.toLowerCase()}` },
    }),
  },
  {
    id: 'nobody_talking',
    name: 'Hidden gem',
    build: (b) => ({
      hook: `Nobody is talking about this ${b.cat} find`,
      bodies: [
        { h: 'No ads, no hype', s: `${b.name} spread purely because people liked using it.` },
        { h: 'Built by people who care', s: 'It shows in every single detail.' },
        { h: 'Genuinely useful', s: b.pitch || `It makes ${b.verbing} feel effortless.` },
      ],
      cta: { h: 'Now you know', s: `Look up ${b.name} — ${LINK.toLowerCase()}` },
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
    cta: { h: `Try ${b.name}`, s: LINK },
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

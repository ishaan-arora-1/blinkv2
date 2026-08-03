// Built-in image library: Blink UGC's AI-generated photo sets (local assets)
// plus an always-offline "Gradient Studio" set generated locally as data URLs.

// Locally generated gradient backgrounds — always work offline
function gradientDataURL(stops, angleDeg = 30, w = 540, h = 675) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  const a = (angleDeg * Math.PI) / 180
  const r = Math.max(w, h)
  const g = ctx.createLinearGradient(
    w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r,
    w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r
  )
  stops.forEach(([off, col]) => g.addColorStop(off, col))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // soft grain
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14
    d[i] += n; d[i + 1] += n; d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/jpeg', 0.85)
}

// Gradients are referenced as "gradient:N", not as the data URL itself.
//
// A generated gradient is ~50 KB of base64. Storing that string in a slide's
// background would put a quarter of a megabyte into every carousel row, and
// carousels are written on every drag. The reference is resolved to pixels at
// render time by resolveImage() instead.
export const GRADIENT_COUNT = 12
export const gradientRefs = () =>
  Array.from({ length: GRADIENT_COUNT }, (_, i) => `gradient:${i}`)

export function isGradientRef(ref) {
  return typeof ref === 'string' && ref.startsWith('gradient:')
}

export function gradientByRef(ref) {
  const i = Number(String(ref).slice('gradient:'.length))
  const all = gradientImages()
  return all[i] ?? all[0] ?? null
}

let gradientSetCache = null
export function gradientImages() {
  if (gradientSetCache) return gradientSetCache
  const palettes = [
    [['0', '#0f0c29'], ['0.5', '#302b63'], ['1', '#24243e']],
    [['0', '#232526'], ['1', '#414345']],
    [['0', '#1a2a1f'], ['1', '#3a6b4a']],
    [['0', '#2b1d12'], ['1', '#8c5a2b']],
    [['0', '#101820'], ['1', '#2a4d69']],
    [['0', '#1f1c2c'], ['1', '#928dab']],
    [['0', '#0b0f0d'], ['0.6', '#12372a'], ['1', '#0b0f0d']],
    [['0', '#2c0d0d'], ['1', '#7b2d2d']],
    [['0', '#0d1b2a'], ['0.5', '#1b263b'], ['1', '#415a77']],
    [['0', '#14100c'], ['1', '#4d3b23']],
    [['0', '#101010'], ['0.5', '#1f1f1f'], ['1', '#0a0a0a']],
    [['0', '#0e1512'], ['1', '#1f4d3a']],
  ].map(p => p.map(([o, c]) => [parseFloat(o), c]))
  gradientSetCache = palettes.map((p, i) => gradientDataURL(p, 20 + i * 25))
  return gradientSetCache
}

// Blink UGC's own AI-generated photo sets, shipped as local assets in /public/sets.
// Cached so object identities are stable across calls — components use these
// as effect dependencies, and fresh identities every render would loop forever.
const setImages = (folder) =>
  Array.from({ length: 10 }, (_, i) => `/sets/${folder}/${String(i + 1).padStart(2, '0')}.jpg`)

let builtinCache = null
export function builtinSets() {
  if (builtinCache) return builtinCache
  builtinCache = [
    { id: 'lib_boy', name: 'That Guy', builtin: true, desc: "Faceless men's lifestyle — mirrors, cafes, sea", images: setImages('boy') },
    { id: 'lib_girl', name: 'Clean Girl', builtin: true, desc: 'Soft pastels, matcha, flatlays, golden hour', images: setImages('girl') },
    { id: 'lib_work', name: 'The Grind', builtin: true, desc: 'Desks, screens, commutes, late nights', images: setImages('work') },
    { id: 'lib_gym', name: 'Gym Era', builtin: true, desc: 'Benches, chalk, sunrise runs, meal prep', images: setImages('gym') },
    { id: 'lib_gradient', name: 'Gradient Studio', builtin: true, desc: 'Clean generated gradients — always available', images: gradientRefs() },
  ]
  return builtinCache
}

// Set the wizard highlights first, based on the brand's category
export function suggestedSetId(category = '') {
  const c = category.toLowerCase()
  if (c.includes('fitness') || c.includes('health')) return 'lib_gym'
  if (
    c.includes('finance') || c.includes('productivity') || c.includes('education') ||
    c.includes('utilities') || c.includes('saas') || c.includes('b2b')
  ) return 'lib_work'
  if (
    c.includes('lifestyle') || c.includes('social') || c.includes('photo') ||
    c.includes('beauty') || c.includes('skincare') || c.includes('fashion') || c.includes('apparel')
  ) return 'lib_girl'
  return 'lib_boy'
}

export function pickRandom(arr, not = null) {
  if (!arr || arr.length === 0) return null
  if (arr.length === 1) return arr[0]
  let x
  do { x = arr[Math.floor(Math.random() * arr.length)] } while (x === not)
  return x
}

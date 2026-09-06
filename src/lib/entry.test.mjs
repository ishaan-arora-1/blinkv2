/**
 * Entry-note logic, run with: node src/lib/entry.test.mjs
 *
 * No framework and no runner: the module touches nothing but localStorage, so a
 * ten-line shim is the whole harness. It exists because the tier/intent split is
 * the kind of thing that looks right and silently does nothing — the first
 * version of it did exactly that, and this is what caught it.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const m = await import('./entry.js')
const { markAdEntry, markPlanIntent, pendingIntent, clearIntent, consumeEntryRoute } = m

let fails = 0
const is = (label, got, want) => {
  const ok = got === want
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}${ok ? '' : ` want ${JSON.stringify(want)}`}`)
}

// ── landing page: buy Studio ──
store.clear()
markPlanIntent('studio')
is('plan/studio  intent before checkout', pendingIntent(), 'studio')
clearIntent()
is('plan/studio  intent spent at checkout', pendingIntent(), null)
is('plan/studio  lands on the thing they bought', consumeEntryRoute(), '/blink')
is('plan/studio  steers once only', consumeEntryRoute(), null)

// ── landing page: buy Creator (must NOT land on locked Blink AI) ──
store.clear()
markPlanIntent('creator')
is('plan/creator intent', pendingIntent(), 'creator')
clearIntent()
is('plan/creator lands on hook videos', consumeEntryRoute(), '/videos')

// ── ad page, unchanged behaviour ──
store.clear()
markAdEntry('studio')
is('ad/studio    intent', pendingIntent(), 'studio')
clearIntent()
is('ad/studio    lands on Blink AI', consumeEntryRoute(), '/blink')

// ── ad page with no committed tier ──
store.clear()
markAdEntry(null)
is('ad/none      no intent to spend', pendingIntent(), null)
is('ad/none      still lands on Blink AI', consumeEntryRoute(), '/blink')

// ── someone who never pressed a plan ──
store.clear()
is('cold visit   no intent', pendingIntent(), null)
is('cold visit   no redirect', consumeEntryRoute(), null)

// ── declined the checkout: tier survives, intent does not ──
store.clear()
markPlanIntent('creator')
clearIntent()
is('declined     no second checkout', pendingIntent(), null)
is('declined     still routed by tier', consumeEntryRoute(), '/videos')

// ── stale note expires ──
store.clear()
markPlanIntent('studio')
const note = JSON.parse(store.get('blink.entry'))
note.at = Date.now() - 25 * 60 * 60 * 1000
store.set('blink.entry', JSON.stringify(note))
is('25h old      intent expired', pendingIntent(), null)
is('25h old      no redirect', consumeEntryRoute(), null)

// ── markPlanIntent(null) must not arm anything ──
store.clear()
markPlanIntent(null)
is('null tier    writes nothing', store.get('blink.entry') ?? null, null)

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)

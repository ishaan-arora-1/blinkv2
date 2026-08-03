/**
 * Two kinds of id, and the difference matters.
 *
 * newId() is a real UUID, for anything that becomes a database row — the
 * primary keys in Postgres are uuid columns and will reject anything else.
 *
 * uid() is the short readable form, for ids that only ever live inside a jsonb
 * document (slides, text layers, overlays). Those are opaque to the database,
 * so they cost nothing and stay easy to read while debugging.
 */

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Safari < 15.4 and any non-secure context.
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

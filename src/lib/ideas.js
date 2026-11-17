import { api } from './api.js'

/**
 * Ad Ideas: a product link in, a strategy and a stack of ready-to-film ads out.
 * The server does the reading and the writing; this is the client half, plus
 * the small amount of state that has to survive leaving the page.
 */

export const fetchIdeaOptions = () => api('/api/ideas/options')

export const importProduct = ({ url, notes }) =>
  api('/api/ideas/import', { method: 'POST', body: { url: url || '', notes: notes || '' } })

export const writeAds = ({ product, angle, framework, length, count, avoid }) =>
  api('/api/ideas/write', { method: 'POST', body: { product, angle, framework, length, count, avoid } })

// ─── the workspace, kept between visits ─────────────────────────────────────
//
// Local to this browser, deliberately. An analysis and its ads are a working
// surface — the thing on screen while someone decides what to film — not a
// record anyone pays for, and losing them to a cleared cache costs one more
// run of a cheap model. Every read and write is guarded, because storage can
// throw in a private window and the page must work without it.

const KEY = 'blink.ideas.v1'

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveWorkspace(ws) {
  try {
    if (ws) localStorage.setItem(KEY, JSON.stringify(ws))
    else localStorage.removeItem(KEY)
  } catch {
    // Full or blocked storage just means the workspace is not remembered.
  }
}

// ─── handing a script to another page ───────────────────────────────────────

const HANDOFF = 'blink.actorScript'

/** Pass a script (and optionally a product image URL) to AI Actors. */
export function sendToActors(ad, productImage) {
  try {
    sessionStorage.setItem(HANDOFF, JSON.stringify({ script: ad.script, hook: ad.hook, productImage: productImage || null }))
  } catch {
    // Without storage the actor page simply opens empty.
  }
}

export function takeActorHandoff() {
  try {
    const raw = sessionStorage.getItem(HANDOFF)
    sessionStorage.removeItem(HANDOFF)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Turn a written ad into a Blink AI idea: the visual direction plus the gist. */
export function ideaFromAd(ad, productName) {
  return `${ad.visual} The ad is for ${productName}. It opens on: "${ad.hook}" and ends with: "${ad.cta}".`.slice(0, 600)
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}

// ─── a link pasted somewhere else, to be read on arrival ────────────────────

const QUEUED = 'blink.ideas.queued'

export function queueLink(url) {
  try {
    sessionStorage.setItem(QUEUED, String(url || '').slice(0, 500))
  } catch {
    // Without storage the page opens with an empty box instead.
  }
}

export function takeQueuedLink() {
  try {
    const v = sessionStorage.getItem(QUEUED)
    sessionStorage.removeItem(QUEUED)
    return v || null
  } catch {
    return null
  }
}

import React, { useEffect, useRef, useState } from 'react'
import { go } from '../lib/router.js'
import { REEL_STATE, isWorking, deleteReel } from '../lib/multiframe.js'

/**
 * Every reel this account has made, as a dropdown at the top of Blink AI.
 *
 * A reel takes minutes and is worth leaving: the point of this control is that
 * you can start one, go and do something else, and find it again — including
 * while it is still rendering, which is why the ones still working are marked
 * rather than hidden.
 */
export default function ReelHistory({ reels, activeId, onNew, onChanged }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on an outside click or Escape, the two ways anyone expects to dismiss
  // a menu they opened by accident.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = reels.find((r) => r.id === activeId)
  const working = reels.filter((r) => isWorking(r.status)).length

  async function remove(e, reel) {
    e.stopPropagation()
    if (!confirm('Delete this reel, with its frames and clips?')) return
    await deleteReel(reel.id)
    await onChanged?.()
    if (reel.id === activeId) go('/blink')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {active ? title(active) : 'Your reels'}
          {working > 0 && <span className="chip accent" style={{ marginLeft: 8 }}>{working} working</span>}
          <span style={{ marginLeft: 8, opacity: 0.7 }}>▾</span>
        </button>
        <button className="btn primary sm" onClick={() => { setOpen(false); onNew() }}>+ New reel</button>
      </div>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 40,
            width: 'min(420px, 86vw)', maxHeight: 380, overflowY: 'auto', padding: 6,
          }}
        >
          {reels.length === 0 ? (
            <div className="small muted" style={{ padding: 12 }}>
              Nothing here yet. Describe a video and it will be saved automatically.
            </div>
          ) : (
            reels.map((r) => (
              <button
                key={r.id}
                className="row between"
                onClick={() => { setOpen(false); go(`/blink/${r.id}`) }}
                style={{
                  width: '100%', textAlign: 'left', gap: 10, padding: '9px 10px',
                  background: r.id === activeId ? 'var(--line-soft, rgba(255,255,255,0.05))' : 'transparent',
                  border: 'none', borderRadius: 8, cursor: 'pointer', alignItems: 'flex-start',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title(r)}
                  </span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {when(r.createdAt)} · {r.sceneCount} scenes · {REEL_STATE[r.status] || r.status}
                  </span>
                </span>
                <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {isWorking(r.status) && <span className="chip accent">working</span>}
                  <span className="btn xs danger" onClick={(e) => remove(e, r)} role="button">✕</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// The model names the reel once it has planned it; until then the idea is the
// only thing there is to call it.
const title = (r) => r.name || truncate(r.idea || 'Untitled reel', 46)

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s)

function when(iso) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

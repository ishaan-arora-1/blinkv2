import React, { useState } from 'react'
import { SCENE_LABEL } from '../lib/multiframe.js'

/**
 * One scene: its picture, its state, and — while the reel is waiting — the
 * controls to change it.
 *
 * The edit box is collapsed by default. Most frames are fine, and a text input
 * under every one of six cards is a wall of furniture for the rare case.
 */
export default function SceneCard({ scene, editable, maxRevisions, onEdit }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const busy = scene.status === 'framing'
  const spent = scene.revisions ?? 0
  const exhausted = spent >= maxRevisions

  function submit(instruction) {
    setOpen(false)
    setNote('')
    onEdit(scene.idx, instruction)
  }

  return (
    <div className="tile" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '9/16', background: '#0d0f0e', position: 'relative' }}>
        {scene.videoUrl ? (
          <video src={scene.videoUrl} muted loop playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : scene.frameUrl ? (
          <img src={scene.frameUrl} alt={`Scene ${scene.idx + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: busy ? 0.35 : 1 }} />
        ) : null}

        <span
          className={`chip ${scene.status === 'ready' ? 'brand' : scene.status === 'failed' ? 'hot' : 'accent'}`}
          style={{ position: 'absolute', left: 8, top: 8 }}
        >
          {SCENE_LABEL[scene.status] || scene.status}
        </span>

        {spent > 0 && (
          <span className="chip" style={{ position: 'absolute', right: 8, top: 8 }}>v{spent + 1}</span>
        )}
      </div>

      <div className="tile-body" style={{ padding: '8px 10px', flex: 1 }}>
        <div className="small muted" style={{ minHeight: 30 }}>
          {scene.error || scene.description || `Scene ${scene.idx + 1}`}
        </div>

        {editable && (
          <div className="mt-2">
            {open ? (
              <>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: '6px 8px' }}
                  autoFocus
                  placeholder="e.g. warmer light, show the label"
                  value={note}
                  maxLength={400}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) submit(note.trim()) }}
                />
                <div className="row mt-2" style={{ gap: 6 }}>
                  <button className="btn primary xs" disabled={!note.trim()} onClick={() => submit(note.trim())}>
                    Apply
                  </button>
                  <button className="btn ghost xs" onClick={() => { setOpen(false); setNote('') }}>Cancel</button>
                </div>
              </>
            ) : (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn xs" disabled={busy || exhausted} onClick={() => setOpen(true)}>
                  Edit
                </button>
                <button className="btn xs" disabled={busy || exhausted} onClick={() => submit('')}>
                  {busy ? '…' : 'Redraw'}
                </button>
              </div>
            )}
            {exhausted && <div className="small muted mt-2">Redraw limit reached.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

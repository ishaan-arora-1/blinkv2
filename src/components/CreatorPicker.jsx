import React from 'react'
import { CREATORS } from '../lib/creators.js'

// Shared creator selection modal — used by the New Video wizard and Blink AI.
export default function CreatorPicker({ selectedId, onSelect, onClose, title = 'Choose your creator', sub }) {
  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" style={{ width: 'min(880px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>{title}</h3>
            <div className="sub">{sub || 'Real AI creators, one consistent look.'}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="grid cols-4" style={{ gap: 12 }}>
          {CREATORS.map((c) => (
            <button key={c.id} className={`tile ${selectedId === c.id ? 'selected' : ''}`} onClick={() => onSelect(c)}>
              <div style={{ aspectRatio: '3/4', overflow: 'hidden' }}>
                <img src={c.img} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div className="tile-body" style={{ padding: '10px 12px' }}>
                <div className="tile-title">{c.name}</div>
                <div className="tile-sub">{c.vibe}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

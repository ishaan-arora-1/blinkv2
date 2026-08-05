import React from 'react'
import { CHARACTERS } from '../lib/characters.js'

/**
 * Character selection for an animated carousel.
 *
 * Four across, same as the creator picker and the same ten-tile roster shape,
 * which also means it inherits the existing cols-4 breakpoints rather than
 * needing its own.
 */
export default function CharacterPicker({
  selectedId,
  onSelect,
  onClose,
  title = 'Choose your character',
  sub,
}) {
  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal" style={{ width: 'min(880px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3>{title}</h3>
            <div className="sub">
              {sub || 'One character fronts every slide, in the same style throughout.'}
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="grid cols-4" style={{ gap: 12 }}>
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              className={`tile ${selectedId === c.id ? 'selected' : ''}`}
              onClick={() => onSelect(c)}
            >
              {/* 4:5, the ratio the slides themselves render at. */}
              <div style={{ aspectRatio: '4/5', overflow: 'hidden', background: '#131019' }}>
                <img
                  src={c.img}
                  alt={c.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div className="tile-body" style={{ padding: '10px 12px' }}>
                <div className="tile-title">{c.name}</div>
                <div className="tile-sub">{c.blurb}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

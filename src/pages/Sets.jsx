import React, { useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { builtinSets } from '../lib/library.js'
import { useSetImages, displayThumb } from '../lib/useImages.js'
import Upsell from '../components/Upsell.jsx'

function SetCard({ set, busy, onDelete, onAddImages, onRemoveImage }) {
  const urls = useSetImages(set)
  const fileRef = useRef(null)

  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="row">
            <b>{set.name}</b>
            {set.builtin ? <span className="chip">built-in</span> : <span className="chip brand">custom</span>}
          </div>
          <div className="small muted">{set.desc || `${set.images?.length ?? 0} images`}</div>
        </div>
        {!set.builtin && (
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Uploading…' : '+ Add images'}
            </button>
            <button className="btn sm danger" disabled={busy} onClick={onDelete}>Delete</button>
            <input
              ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { onAddImages([...e.target.files]); e.target.value = '' }}
            />
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', marginTop: 14, gap: 8 }}>
        {urls.map((u, i) => (
          <div key={set.images[i]?.id ?? i} className="img-cell" style={{ backgroundImage: `url("${displayThumb(u)}")`, position: 'relative', cursor: 'default' }}>
            {!set.builtin && (
              <button
                className="btn xs danger"
                style={{ position: 'absolute', top: 4, right: 4, padding: '1px 7px' }}
                onClick={() => onRemoveImage(set.images[i])}
              >✕</button>
            )}
          </div>
        ))}
        {urls.length === 0 && <div className="small muted" style={{ gridColumn: '1/-1' }}>No images yet — upload some.</div>}
      </div>
    </div>
  )
}

export default function Sets() {
  const store = useStore()
  const { can } = useAuth()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busySet, setBusySet] = useState(null)
  const [error, setError] = useState(null)

  async function addImages(setId, files) {
    if (!files.length) return
    setBusySet(setId)
    setError(null)
    try {
      await store.addImagesToSet(setId, files)
    } catch (err) {
      setError(`Upload failed: ${err.message}`)
    } finally {
      setBusySet(null)
    }
  }

  async function createSet() {
    setError(null)
    try {
      await store.createSet(name)
      setName('')
      setCreating(false)
    } catch (err) {
      setError(`Could not create the set: ${err.message}`)
    }
  }

  return (
    <div>
      <div className="page-head row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-kicker">Library</div>
          <h1 className="page-title">Image <em>sets</em></h1>
          <p className="page-sub">
            Built-in lifestyle collections plus your own uploads. In the carousel editor you pick a set per
            section (hook / body / CTA) and shuffle within it.
          </p>
        </div>
        {can.sets && <button className="btn primary" onClick={() => setCreating(true)}>+ New custom set</button>}
      </div>

      {/* The built-in collections below stay usable on every plan — they are
          what a free photo carousel is built from, so hiding this page would
          hide the thing the free tier runs on. Only uploading is bought. */}
      {!can.sets && (
        <div style={{ marginBottom: 22 }}>
          <Upsell
            feature="sets"
            pitch="Upload your own product photography into named sets and build carousels straight from it, instead of choosing from the built-in collections below."
          />
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'rgba(255,122,89,0.4)', marginBottom: 18 }}>
          <div className="row"><span className="chip hot">error</span></div>
          <div className="small mt-2">{error}</div>
        </div>
      )}

      <div className="grid" style={{ gap: 18 }}>
        {store.state.customSets.map((set) => (
          <SetCard
            key={set.id}
            set={set}
            busy={busySet === set.id}
            onDelete={() => { if (confirm(`Delete “${set.name}” and its images?`)) store.deleteSet(set) }}
            onAddImages={(files) => addImages(set.id, files)}
            onRemoveImage={(image) => store.removeSetImage(set.id, image)}
          />
        ))}
        {builtinSets().map((set) => <SetCard key={set.id} set={set} />)}
      </div>

      {creating && (
        <div className="modal-veil" onClick={() => setCreating(false)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>New custom set</h3>
            <div className="sub">Name it, then upload your own photos into it.</div>
            <div className="field">
              <label>Set name</label>
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createSet()} placeholder="e.g. Our app screenshots" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn primary" onClick={createSet}>Create set</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

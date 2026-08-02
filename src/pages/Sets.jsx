import React, { useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { builtinSets } from '../lib/library.js'
import { putBlob, deleteBlob, uid } from '../lib/idb.js'
import { useSetImages } from '../lib/useImages.js'

function SetCard({ set, onDelete, onAddImages, onRemoveImage }) {
  const urls = useSetImages(set)
  const fileRef = useRef(null)
  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="row">
            <b>{set.name}</b>
            {set.builtin ? <span className="chip">built-in</span> : <span className="chip mint">custom</span>}
          </div>
          <div className="small muted">{set.desc || `${urls.length} images`}</div>
        </div>
        {!set.builtin && (
          <div className="row">
            <button className="btn sm" onClick={() => fileRef.current?.click()}>+ Add images</button>
            <button className="btn sm danger" onClick={onDelete}>Delete</button>
            <input
              ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { onAddImages([...e.target.files]); e.target.value = '' }}
            />
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', marginTop: 14, gap: 8 }}>
        {urls.map((u, i) => (
          <div key={i} className="img-cell" style={{ backgroundImage: `url(${u})`, position: 'relative', cursor: 'default' }}>
            {!set.builtin && (
              <button
                className="btn xs danger"
                style={{ position: 'absolute', top: 4, right: 4, padding: '1px 7px' }}
                onClick={() => onRemoveImage(i)}
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
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function addImagesTo(setId, files) {
    const entries = []
    for (const f of files) {
      const key = uid('img')
      await putBlob(key, f)
      entries.push({ key })
    }
    store.update((s) => ({
      customSets: s.customSets.map((cs) => (cs.id === setId ? { ...cs, images: [...cs.images, ...entries] } : cs)),
    }))
  }

  function createSet() {
    const id = uid('set')
    store.update((s) => ({ customSets: [...s.customSets, { id, name: name.trim() || 'My set', images: [] }] }))
    setName('')
    setCreating(false)
  }

  async function deleteSet(set) {
    for (const img of set.images) if (img.key) await deleteBlob(img.key).catch(() => {})
    store.update((s) => ({ customSets: s.customSets.filter((cs) => cs.id !== set.id) }))
  }

  function removeImage(setId, idx) {
    store.update((s) => ({
      customSets: s.customSets.map((cs) => {
        if (cs.id !== setId) return cs
        const img = cs.images[idx]
        if (img?.key) deleteBlob(img.key).catch(() => {})
        return { ...cs, images: cs.images.filter((_, i) => i !== idx) }
      }),
    }))
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
        <button className="btn primary" onClick={() => setCreating(true)}>+ New custom set</button>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        {store.state.customSets.map((set) => (
          <SetCard
            key={set.id}
            set={set}
            onDelete={() => deleteSet(set)}
            onAddImages={(files) => addImagesTo(set.id, files)}
            onRemoveImage={(i) => removeImage(set.id, i)}
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

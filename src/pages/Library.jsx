import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { resolveImage } from '../lib/useImages.js'
import { GENERATIONS, signedUrl } from '../lib/storage.js'

const FILTERS = [
  { id: 'all', label: 'Everything', noun: 'anything' },
  { id: 'carousel', label: 'Carousels', noun: 'carousels' },
  { id: 'video', label: 'Hook videos', noun: 'hook videos' },
  { id: 'blink', label: 'Blink AI', noun: 'Blink AI clips' },
]

const TAG = { carousel: 'Carousel', video: 'Hook video', blink: 'Blink AI' }

// Resolve each item's thumbnail once per set of ids. Depending on the items
// array itself would re-run every render — same trap as in useImages.js.
//
// Status is part of the signature because a Blink AI clip has no thumbnail
// while it renders and gains one when it finishes; keying on id alone would
// leave it showing "rendering…" until a manual reload.
function useThumbs(items) {
  const [map, setMap] = useState({})
  const ref = useRef(items)
  ref.current = items
  const sig = items.map((i) => `${i.id}:${i.status || ''}`).join('|')
  useEffect(() => {
    let alive = true
    Promise.all(ref.current.map(async (it) => [it.id, await it.thumb()]))
      .then((pairs) => { if (alive) setMap(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [sig])
  return map
}

function LibCard({ item, thumb }) {
  const open = () => { if (item.href) window.location.hash = item.href }
  return (
    <div className="tile" style={{ cursor: item.href ? 'pointer' : 'default' }} onClick={open}>
      <div
        className="lib-media"
        style={!item.motion && thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        <span className={`lib-tag ${item.kind}`}>{TAG[item.kind]}</span>
        {item.motion && thumb && <video src={thumb} muted loop playsInline autoPlay />}
        {!thumb && (
          <span className="small muted">
            {item.status === 'failed'
              ? 'failed'
              : item.status && item.status !== 'ready'
                ? <span className="tick">rendering…</span>
                : 'no preview'}
          </span>
        )}
      </div>
      <div className="tile-body">
        <div className="tile-title lib-title" title={item.title}>{item.title}</div>
        <div className="tile-sub">{item.sub}</div>
        <div className="row between mt-2">
          <span className="tile-sub">{new Date(item.createdAt).toLocaleDateString()}</span>
          <div className="row" style={{ gap: 6 }}>
            {item.download && thumb && (
              <a
                className="btn xs" href={thumb} download={item.download}
                onClick={(e) => e.stopPropagation()}
              >⬇ Download</a>
            )}
            <button
              className="btn xs danger"
              onClick={(e) => { e.stopPropagation(); if (confirm(`Delete “${item.title}”?`)) item.remove() }}
            >Delete</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Library() {
  const store = useStore()
  const { carousels, videos, blinks } = store.state
  const [filter, setFilter] = useState('all')

  const items = useMemo(() => {
    const all = [
      ...carousels.map((c) => ({
        kind: 'carousel',
        id: c.id,
        createdAt: c.createdAt,
        title: c.name,
        sub: `${c.slides.length} slide${c.slides.length === 1 ? '' : 's'} · 1080 × 1350`,
        href: `/carousel/${c.id}`,
        thumb: () => resolveImage(c.slides[0]?.bg),
        remove: () => store.deleteCarousel(c.id),
      })),
      ...videos.filter((v) => store.getCharacter(v.characterId)).map((v) => {
        const char = store.getCharacter(v.characterId)
        return {
          kind: 'video',
          id: v.id,
          createdAt: v.createdAt,
          title: v.name,
          sub: `${char.name} · ${v.hook?.label || 'hook'} · ${v.demoPath ? 'demo attached' : 'no demo yet'}`,
          href: `/video/${v.id}`,
          thumb: async () => char.img,
          remove: () => store.deleteVideo(v.id),
        }
      }),
      ...blinks.map((b) => ({
        kind: 'blink',
        id: b.id,
        createdAt: b.createdAt,
        title: b.prompt.length > 52 ? b.prompt.slice(0, 52) + '…' : b.prompt,
        sub:
          b.status === 'ready'
            ? [b.creatorName, `${b.durationSeconds}s`, b.aspectRatio, b.resolution].filter(Boolean).join(' · ')
            : b.status === 'failed'
              ? b.error || 'Generation failed'
              : 'Rendering…',
        status: b.status,
        // Only a finished generation has anything to play or download.
        motion: b.status === 'ready',
        download: b.status === 'ready' ? `blink-ai-${b.id}.mp4` : null,
        thumb: async () => (b.status === 'ready' ? signedUrl(GENERATIONS, b.storagePath) : null),
        remove: () => store.deleteBlink(b.id),
      })),
    ]
    return all.sort((a, b) => b.createdAt - a.createdAt)
  }, [carousels, videos, blinks])

  const thumbs = useThumbs(items)
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const count = (id) => (id === 'all' ? items.length : items.filter((i) => i.kind === id).length)

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Create</div>
        <h1 className="page-title">Everything you've <em>minted</em></h1>
        <p className="page-sub">
          Carousels, hook videos and Blink AI generations in one place, newest first.
          Open anything to keep editing, or download it and post.
        </p>
      </div>

      {items.length > 0 && (
        <div className="row between wrap" style={{ marginBottom: 20 }}>
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ opacity: 0.6 }}>{count(f.id)}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => (window.location.hash = '/carousels')}>❏ New carousel</button>
            <button className="btn sm" onClick={() => (window.location.hash = '/videos')}>▶ New video</button>
            <button className="btn sm" onClick={() => (window.location.hash = '/blink')}>✦ Blink AI</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="big">▤</div>
          <b>Your library is empty.</b>
          <div className="small mt-2">Mint a carousel, a hook video or a Blink AI clip and it lands here.</div>
          <div className="row mt-4" style={{ justifyContent: 'center' }}>
            <button className="btn sm" onClick={() => (window.location.hash = '/carousels')}>❏ Carousels</button>
            <button className="btn sm" onClick={() => (window.location.hash = '/videos')}>▶ Hook videos</button>
            <button className="btn sm" onClick={() => (window.location.hash = '/blink')}>✦ Blink AI</button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <div className="big">▤</div>
          <b>Nothing here yet.</b>
          <div className="small mt-2">No {FILTERS.find((f) => f.id === filter)?.noun} in your library so far.</div>
        </div>
      ) : (
        <div className="grid cols-3">
          {shown.map((item) => <LibCard key={item.id} item={item} thumb={thumbs[item.id]} />)}
        </div>
      )}
    </div>
  )
}

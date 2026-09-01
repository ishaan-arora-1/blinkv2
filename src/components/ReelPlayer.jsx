import React, { useState } from 'react'
import { slug } from '../lib/multiframe.js'
import ReelFinish from './ReelFinish.jsx'
import DownloadButton from './DownloadButton.jsx'

/**
 * A finished reel: its clips, and the studio that turns them into a video.
 *
 * The clips stay first-class. Each one is a finished video in its own right —
 * somebody may want scene three on its own, or want to post them as a series
 * rather than a single cut — so they are listed with their own controls and
 * downloads and are never replaced by the combined version.
 *
 * Everything past that is behind one button, because it mounts a hidden video
 * element per clip and runs a render loop, and none of that should exist for
 * someone who only came to grab a clip.
 */
export default function ReelPlayer({ reel, voices, onRefresh }) {
  const [open, setOpen] = useState(false)

  const clips = (reel.scenes || []).filter((s) => s.status === 'ready' && s.videoUrl)
  const saved = (reel.cuts || []).length

  if (!clips.length) {
    return (
      <div className="card mt-6" style={{ maxWidth: 900 }}>
        <div className="row"><span className="chip hot">nothing to play</span></div>
        <div className="small mt-2">No scene in this reel finished rendering.</div>
      </div>
    )
  }

  return (
    <div className="card mt-6" style={{ maxWidth: 900 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h4 style={{ color: 'var(--accent)' }}>{reel.name || 'Your reel'}</h4>
        <span className="small muted">
          {clips.length} clips{saved > 0 && ` · ${saved} version${saved === 1 ? '' : 's'} saved`}
        </span>
      </div>

      <div className="grid cols-4 stack-sm" style={{ gap: 12 }}>
        {clips.map((s) => (
          <div key={s.idx} className="tile" style={{ overflow: 'hidden' }}>
            <div style={{ aspectRatio: '9/16', background: '#0d0f0e' }}>
              <video src={s.videoUrl} controls loop playsInline preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="tile-body" style={{ padding: '8px 10px' }}>
              <div className="row between">
                <span className="small muted">Scene {s.idx + 1}</span>
                <DownloadButton
                  url={s.videoUrl}
                  filename={`${slug(reel.name || 'scene')}-${s.idx + 1}.mp4`}
                  label="⬇"
                  title={`Download scene ${s.idx + 1}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <ReelFinish reel={reel} voices={voices} onRefresh={onRefresh} />
      ) : (
        <div className="row between mt-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div className="small muted">
            Join the clips, narrate them, add subtitles — every version kept separately.
          </div>
          <button className="btn primary" onClick={() => setOpen(true)}>⧉ Combine &amp; finish</button>
        </div>
      )}
    </div>
  )
}


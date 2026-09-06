import React from 'react'
import { MF_SCENES, MF_FINAL, mfFrame, mfClip } from '../lib/multiframeStory.js'
import HookPreview from './HookPreview.jsx'
import SignInButton from './SignInButton.jsx'

/**
 * Multi-frame, shown rather than described.
 *
 * Three bands, one per stage, in the order the pipeline runs: the frames it
 * drew, the scenes it filmed from them, the video it cut them into. The
 * columns line up, so the fourth clip sitting under the fourth frame is the
 * whole mapping stated without an arrow or a caption for it.
 *
 * Almost no prose on purpose. The claim — one person, five places, one video —
 * is a thing you either see in the pictures or do not believe in a paragraph.
 *
 * Nothing but posters loads until someone shows interest: the scene clips are
 * HookPreview, which holds `preload="none"` until they are pointed at or
 * tapped, and the final carries controls so it is the visitor who spends the
 * 1.6 MB, not the page.
 */
export default function MultiFrameStrip() {
  return (
    <div className="mf">
      <Band label="Frames" note="drawn from one prompt">
        <div className="mf-row">
          {MF_SCENES.map((s) => (
            <figure className="mf-tile" key={s.id}>
              <img src={mfFrame(s.id)} alt={`Frame drawn for the ${s.place.toLowerCase()} scene`} loading="lazy" />
              <figcaption>{s.place}</figcaption>
            </figure>
          ))}
        </div>
      </Band>

      <Band label="Scenes" note="each frame, filmed">
        <div className="mf-row">
          {MF_SCENES.map((s) => (
            <div className="mf-tile mf-clip" key={s.id}>
              <HookPreview hook={mfClip(s.id)} alt={`The ${s.place.toLowerCase()} scene, filmed`} />
              {/* Sits over Veo's burnt-in sparkle, which is why it is anchored
                  in percentages rather than pixels — the mark scales with the
                  frame, so the thing covering it has to as well. */}
              <span className="mf-dur">{s.seconds}s</span>
            </div>
          ))}
        </div>
      </Band>

      <Band label="The video" note="cut, voiced, subtitled">
        <div className="mf-final">
          <video
            src={MF_FINAL.src}
            poster={MF_FINAL.poster}
            controls
            playsInline
            preload="none"
            aria-label="The finished multi-frame ad"
          />
        </div>
      </Band>

      <div className="mf-foot">
        <span>Same face, same top, five rooms — and one voice over all of it.</span>
        <SignInButton label="Make one of your own" className="btn primary sm" />
      </div>
    </div>
  )
}

/**
 * A stage: its name on a rail beside the pictures.
 *
 * The rail is a column on a desktop and a line above the row on a phone, where
 * 130px of label beside a strip of five tiles would leave the tiles about a
 * thumbnail wide between them.
 */
function Band({ label, note, children }) {
  return (
    <section className="mf-band">
      <div className="mf-rail">
        <b>{label}</b>
        <span>{note}</span>
      </div>
      {children}
    </section>
  )
}

import React from 'react'
import Logo from './Logo.jsx'

/**
 * The capability rail.
 *
 * Every line is a thing the product does today — the four makers under Create
 * are the four routes in the studio's own nav, and the rest are controls that
 * exist inside them: the redraw box on a scene card, the eight ElevenLabs
 * voices, the 4/6/8-second scene lengths, the music beds in the video editor.
 * Nothing here is a roadmap. A landing page that lists what is coming is how
 * you get a refund request in week one.
 *
 * Deliberately not links. There is no marketing page behind any of these, and
 * a row of buttons that all do the same thing — bounce you to a Google sign-in
 * — is worse than a row that is honestly just a list.
 */
const GROUPS = [
  {
    name: 'Plan',
    items: [
      { ico: '✺', label: 'Ad Ideas from a link', tag: 'Free' },
      { ico: '◎', label: 'Buyer personas' },
      { ico: '⟡', label: 'Six ad angles' },
      { ico: '✍', label: 'Hook Lab scripts' },
    ],
  },
  {
    name: 'Create',
    items: [
      { ico: '◉', label: 'AI Actors', tag: 'New' },
      { ico: '✦', label: 'Blink AI reel', tag: 'Studio' },
      { ico: '▶', label: 'Hook video' },
      { ico: '❏', label: 'Instagram post' },
    ],
  },
  {
    name: 'Direct',
    items: [
      { ico: '☺', label: 'Clone yourself' },
      { ico: '✋', label: 'Product in hand' },
      { ico: '✎', label: 'Redraw any frame' },
      { ico: '♫', label: 'Pick the voice', tag: '8' },
    ],
  },
  {
    name: 'Finish',
    items: [
      { ico: '⌁', label: 'Burn in subtitles' },
      { ico: '♪', label: 'Score it' },
      { ico: 'T', label: 'Text overlay' },
      { ico: '⤢', label: '9:16 and 4:5' },
    ],
  },
  {
    name: 'Set up',
    items: [
      { ico: '✧', label: 'Brand voice' },
      { ico: '❖', label: 'Image sets' },
      { ico: '▤', label: 'Library' },
    ],
  },
]

/** What actually renders the frames, the film, the read and the script. */
const MODELS = ['Kling Avatar', 'MiniMax H3', 'Nano Banana', 'ElevenLabs', 'Claude', 'Gemini']

export default function SideRail() {
  return (
    <aside className="rail" aria-label="What Blink does">
      <div className="rail-scroll">
        <div className="rail-brand">
          <Logo size={24} />
          <div className="rail-sub">ugc studio for your product</div>
        </div>

        {GROUPS.map((g) => (
          <div className="rail-group" key={g.name}>
            <div className="rail-group-head">{g.name}</div>
            <ul>
              {g.items.map((it) => (
                <li key={it.label}>
                  <span className="rail-ico" aria-hidden="true">{it.ico}</span>
                  <span className="rail-label">{it.label}</span>
                  {it.tag && <span className="rail-tag">{it.tag}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="rail-models">
          <div className="rail-group-head">Models</div>
          <div className="rail-model-chips">
            {MODELS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

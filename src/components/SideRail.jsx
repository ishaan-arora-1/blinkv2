import React, { useEffect, useState } from 'react'
import Logo from './Logo.jsx'

/**
 * The landing page's table of contents.
 *
 * It used to be a static list of capabilities styled like a nav — rows with
 * icons and hover states that did nothing when clicked, which reads as broken.
 * Every row is now a real control: it scrolls to the section of this page that
 * shows that thing, and the row for the section on screen is lit as you scroll,
 * so the rail doubles as a map of where you are.
 *
 * Only things with a section get a row. A capability with nothing to show for
 * it on this page does not belong on a list of places to go.
 */
const GROUPS = [
  {
    name: 'See the work',
    items: [
      { ico: '▶', label: 'UGC ads', to: 'work-ugc' },
      { ico: '◆', label: 'Product film', to: 'work-product' },
    ],
  },
  {
    name: 'Plan',
    items: [
      { ico: '✺', label: 'Ad Ideas from a link', to: 'ideas', tag: 'Free' },
      { ico: '✍', label: 'Hook Lab scripts', to: 'ideas-ads' },
    ],
  },
  {
    name: 'Create',
    items: [
      { ico: '◉', label: 'AI Actors', to: 'actors', tag: 'New' },
      { ico: '☺', label: 'The cast', to: 'actors-faces' },
    ],
  },
  {
    name: 'Decide',
    items: [
      { ico: '≋', label: 'What it replaces', to: 'value' },
      { ico: '$', label: 'Pricing', to: 'pricing' },
      { ico: '→', label: 'How it works', to: 'how' },
      { ico: '?', label: 'Questions', to: 'faq' },
    ],
  },
]

const TARGETS = GROUPS.flatMap((g) => g.items.map((i) => i.to))

/** What actually renders the frames, the film, the read and the script. */
const MODELS = ['Kling Avatar', 'MiniMax H3', 'Nano Banana', 'ElevenLabs', 'Claude', 'Gemini']

function jump(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Which section is on screen: the last target whose top has passed a line a
 * third of the way down the viewport. Cheaper and steadier than juggling
 * IntersectionObserver ratios across sections of very different heights.
 */
function useActiveSection() {
  const [active, setActive] = useState(null)
  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const line = window.innerHeight / 3
      let current = null
      for (const id of TARGETS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      // Sections that share a parent (the ads column inside #ideas) can both
      // have passed the line; the deeper one wins because it comes later.
      setActive(current)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return active
}

export default function SideRail() {
  const active = useActiveSection()

  return (
    <aside className="rail" aria-label="On this page">
      <div className="rail-scroll">
        <button type="button" className="rail-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <Logo size={24} />
          <div className="rail-sub">ugc studio for your product</div>
        </button>

        {GROUPS.map((g) => (
          <nav className="rail-group" key={g.name} aria-label={g.name}>
            <div className="rail-group-head">{g.name}</div>
            <ul>
              {g.items.map((it) => (
                <li key={it.label}>
                  <button
                    type="button"
                    className={`rail-link ${active === it.to ? 'on' : ''}`}
                    aria-current={active === it.to ? 'true' : undefined}
                    onClick={() => jump(it.to)}
                  >
                    <span className="rail-ico" aria-hidden="true">{it.ico}</span>
                    <span className="rail-label">{it.label}</span>
                    {it.tag && <span className="rail-tag">{it.tag}</span>}
                    <span className="rail-go" aria-hidden="true">↓</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="rail-models">
          <div className="rail-group-head">Runs on</div>
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

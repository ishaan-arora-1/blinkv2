import React, { useState } from 'react'
import { markIdea, markLink } from '../lib/entry.js'
import { useAuth } from '../lib/auth.jsx'

/**
 * The prompt box in the hero, in two modes.
 *
 * "From a link" is the default and it is free: paste a product page, sign in,
 * and the first thing after onboarding is that product read and a stack of
 * ads written for it — Ad Ideas costs a fraction of a cent, so there is a real
 * thing to give away. That is a much smaller ask of a cold visitor than a
 * subscription, and it ends with them looking at their own product sold back
 * to them, which is the strongest argument the page can make.
 *
 * "Describe a video" is the original box. What gets typed is kept (markIdea)
 * and prefills Blink AI after sign-up; pressing Generate opens the paywall
 * honestly rather than spinning and then asking for a card.
 */
export default function PromptBar({ onPaywall }) {
  const { signInWithGoogle, signingIn } = useAuth()
  const [mode, setMode] = useState('link')
  const [idea, setIdea] = useState('')
  const [link, setLink] = useState('')

  function submit(e) {
    e?.preventDefault()
    if (mode === 'link') {
      const url = link.trim()
      if (!url) return
      // Written before the redirect: OAuth reloads the document.
      markLink(url)
      signInWithGoogle()
      return
    }
    const text = idea.trim()
    if (!text) return
    markIdea(text)
    onPaywall(text)
  }

  const value = mode === 'link' ? link : idea

  return (
    <div className="pbar-wrap">
      <div className="pbar-modes" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'link'} className={mode === 'link' ? 'on' : ''} onClick={() => setMode('link')}>
          From a product link <span className="pbar-free">free</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'idea'} className={mode === 'idea' ? 'on' : ''} onClick={() => setMode('idea')}>
          Describe a video
        </button>
      </div>
      <form className="pbar" onSubmit={submit}>
        <span className="pbar-ico" aria-hidden="true">{mode === 'link' ? '🔗' : '✦'}</span>
        {mode === 'link' ? (
          <input
            className="pbar-input"
            value={link}
            maxLength={500}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste your product page — yourshop.com/products/best-seller"
            aria-label="Your product link"
            inputMode="url"
          />
        ) : (
          <input
            className="pbar-input"
            value={idea}
            maxLength={600}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A 20-second ad for my cold brew — someone making it at home, ending on the can"
            aria-label="Describe the ad you want"
          />
        )}
        <button className="btn primary pbar-go" type="submit" disabled={!value.trim() || signingIn}>
          {mode === 'link' ? (signingIn ? 'Opening Google…' : 'Write my ads') : 'Generate'} <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  )
}

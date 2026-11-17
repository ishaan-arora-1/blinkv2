import React, { useState } from 'react'
import { markIdea } from '../lib/entry.js'

/**
 * The prompt box in the hero, and the paywall it opens.
 *
 * It is a real box, not a picture of one. What gets typed here is kept (see
 * markIdea) and prefills the composer on the Blink AI page after they sign up,
 * so the two sentences somebody writes to try the product are the two
 * sentences it is actually made from. A prompt box that discards its input is
 * a prop, and anybody who types into one and later finds an empty textarea
 * knows they were handled.
 *
 * Pressing Generate does not generate. It says so, plainly, the moment it is
 * pressed — Blink AI is a paid feature and a minute of video costs real money
 * at the model, so there is no free run to give away. The alternative, a
 * button that spins and then asks for a card, is the pattern that makes people
 * distrust the rest of the page.
 */
export default function PromptBar({ onPaywall }) {
  const [idea, setIdea] = useState('')

  function submit(e) {
    e?.preventDefault()
    const text = idea.trim()
    if (!text) return
    markIdea(text)
    onPaywall(text)
  }

  return (
    <form className="pbar" onSubmit={submit}>
      <span className="pbar-ico" aria-hidden="true">✦</span>
      <input
        className="pbar-input"
        value={idea}
        maxLength={600}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="A 20-second ad for my cold brew — someone making it at home, ending on the can"
        aria-label="Describe the ad you want"
      />
      <button className="btn primary pbar-go" type="submit" disabled={!idea.trim()}>
        Generate <span aria-hidden="true">→</span>
      </button>
    </form>
  )
}

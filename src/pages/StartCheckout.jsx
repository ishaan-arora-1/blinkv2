import React from 'react'
import { useAuth } from '../lib/auth.jsx'
import { PLAN_NAME } from '../lib/tiers.js'
import Logo from '../components/Logo.jsx'
import PlanCard from '../components/PlanCard.jsx'

// What each plan actually buys, in one clause. Named per tier because the
// screen is the last thing between a decision and a charge, and a line that
// describes the wrong plan there is the most expensive sentence on the site.
const PITCH = {
  creator: 'unlocks hook videos, animated carousels and your own image sets',
  studio: 'unlocks Blink AI — multi-scene video with the script, the voiceover and the subtitles written for you',
  agency: 'unlocks Blink AI at six minutes of finished video a month, with everything on Creator and Studio',
}

/**
 * The one screen between signing up and paying.
 *
 * Someone who pressed a button with a price on it has already decided. What
 * used to happen next was an onboarding hero, a six-field form about their
 * brand, a studio, a lock, and a page of four plans — five screens, the last of
 * which invited them to reconsider and offered a cheaper tier that does not
 * include the thing they came for. This is that path with everything removed
 * except the transaction.
 *
 * Reached from both landing pages now, so the pitch is read off the tier rather
 * than assumed: this used to promise Blink AI to everyone who arrived, which is
 * a promise the Creator plan does not keep.
 *
 * Nothing is asked for here. The brand form still has to happen, but it happens
 * after the money, where it is setup for something they own rather than a toll
 * on the way to buying it.
 *
 * Rendered before the onboarding gate and outside the studio shell: no sidebar,
 * nowhere to wander, one button.
 *
 * `onDone` is owned by App because clearing the note in storage is not a thing
 * React can see — the screen goes away when the state above it changes, not
 * when localStorage does.
 */
export default function StartCheckout({ tier, onDone }) {
  const { user, signOut } = useAuth()
  const name = PLAN_NAME[tier] || 'this plan'
  const pitch = PITCH[tier] || 'unlocks the paid features'
  const firstName = (user?.fullName || user?.user_metadata?.full_name || '').split(' ')[0]

  return (
    <div className="start">
      <div className="start-inner">
        <header className="start-head">
          <Logo size={26} />
          <h1>
            {firstName ? `You're in, ${firstName}.` : "You're in."} <em>One step left.</em>
          </h1>
          <p>
            Your account is ready. {name} {pitch}. We'll set your product up straight after.
          </p>
        </header>

        <PlanCard tier={tier} onPurchased={onDone} />

        {/* The way out. Someone who changes their mind at a payment screen and
            finds no alternative does not become a free user, they become a
            closed tab — and we already have their account by this point. */}
        <div className="start-foot">
          <button className="btn ghost sm" onClick={onDone}>
            Not now — start free with photo carousels →
          </button>
          <span className="small muted">
            Signed in as {user?.email}
            <button className="btn ghost xs" onClick={signOut}>Not you?</button>
          </span>
        </div>
      </div>
    </div>
  )
}

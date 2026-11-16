import React from 'react'
import { CONTACT_EMAIL } from '../lib/contact.js'
import Logo from '../components/Logo.jsx'

/**
 * Privacy policy and terms, as real pages rather than a link to nothing.
 *
 * Rendered before the config and session checks in App, for the same reason
 * /go is: a policy that only loads for someone who is already signed in is not
 * a policy anyone can read before deciding to sign in, and Meta's ad review
 * fetches it logged out.
 *
 * Everything named below was read off the code rather than copied from a
 * template — the processors are the ones the app actually calls, and the
 * retention claims match what the product really does. The one thing left
 * blank is the legal entity: that is a fact about a company, not about a
 * codebase, and inventing it would be the one false statement on a page whose
 * whole job is to be true. Search for ENTITY.
 */

const UPDATED = '17 November 2026'

/** The third parties that actually see user data, and what each one is for. */
const PROCESSORS = [
  ['Supabase', 'Accounts, database and file storage. Holds your email, your brand details and everything you upload or generate.'],
  ['Railway', 'Runs our API. Processes requests; stores nothing of its own.'],
  ['Vercel', 'Serves this website.'],
  ['Google', 'Sign-in. We receive your name, email address and profile picture — never your password.'],
  ['fal.ai', 'Generation. Receives the prompts and product images needed to render your frames, video and voiceover.'],
  ['Gumroad', 'Payments. Handles your card details directly — we never see or store them.'],
  ['PostHog', 'Product analytics: which pages and features get used.'],
  ['Meta', 'Advertising measurement, via the Meta pixel, so we can tell which ads bring people here.'],
]

function Shell({ title, children }) {
  return (
    <div className="lp lp-v2 legal">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="#/" style={{ textDecoration: 'none' }}><Logo size={25} /></a>
          <div className="spacer" />
          <a className="btn sm" href="#/">Back to site</a>
        </div>
      </nav>
      <div className="lp-wrap legal-doc">
        <h1>{title}</h1>
        <p className="legal-meta">Last updated {UPDATED}</p>
        {children}
        <footer className="lp-footer">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Blink UGC</span>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>
        </footer>
      </div>
    </div>
  )
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy">
      <p>
        Blink UGC (&ldquo;we&rdquo;) makes advertising videos and images from a product photo and a
        short brief. This policy explains what we collect, why, and who else sees it. It covers
        blinkugc.com and the Blink UGC application.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details.</b> When you sign in with Google we receive your name, email address and profile picture. We never receive your Google password.</li>
        <li><b>What you give the product.</b> Your brand and product details, the images you upload, and the briefs you write.</li>
        <li><b>What the product makes.</b> The frames, clips, voiceovers and finished videos generated for you.</li>
        <li><b>Billing records.</b> Which plan you are on and whether it is active. Card details go to Gumroad and never reach us.</li>
        <li><b>Usage data.</b> Pages visited, features used, approximate location from your IP address, and device and browser type.</li>
      </ul>

      <h2>Why we collect it</h2>
      <p>
        To run the product you asked for, to meter the plan you bought, to keep your work available
        when you come back, to improve what we build, and to measure which of our ads work. We do
        not sell your data, and we do not use your product images or generated videos to train
        models.
      </p>

      <h2>Who else sees it</h2>
      <table className="legal-table">
        <tbody>
          {PROCESSORS.map(([name, why]) => (
            <tr key={name}><th>{name}</th><td>{why}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Each is a processor acting on our instructions. Your data may be stored or processed outside
        your own country, including in the United States and the European Union.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        We use cookies and similar storage to keep you signed in, to remember which plan you came to
        buy across the sign-in redirect, and for the analytics and advertising measurement described
        above. You can block cookies in your browser; sign-in will stop working if you block ours.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your account and your work are kept for as long as your account exists. Delete your account
        and we delete your brands, uploads and generated media. Billing records are kept for as long
        as tax and accounting rules require. Analytics data is retained in aggregate.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct it, or ask us to delete it. If you are
        in the UK, EU or EEA you also have the right to object to processing, to restrict it, and to
        complain to your local data protection authority. Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will respond within 30 days.
      </p>

      <h2>Children</h2>
      <p>Blink UGC is not for anyone under 18, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy we will update the date at the top, and tell you by email if the
        change is significant.
      </p>

      <h2>Contact</h2>
      <p>
        {/* ENTITY — replace with the registered company name and address. */}
        Blink UGC — <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </Shell>
  )
}

export function Terms() {
  return (
    <Shell title="Terms of Service">
      <p>Using Blink UGC means agreeing to these terms. If you do not agree, do not use it.</p>

      <h2>The service</h2>
      <p>
        Blink UGC generates advertising images and video from the product details, images and briefs
        you provide. Output is produced by AI models and varies in quality. We do not guarantee that
        any particular generation will be usable, accurate, or that any ad will perform.
      </p>

      <h2>Your account</h2>
      <p>
        You need a Google account to sign in, you must be 18 or over, and you are responsible for
        what happens under your account.
      </p>

      <h2>What you upload</h2>
      <p>
        You keep ownership of everything you upload. You confirm you have the right to use it —
        including any product, logo, trademark or person appearing in it — and you give us the
        licence we need to store it and to generate from it. Do not upload anything unlawful, or
        anyone&rsquo;s likeness without their permission.
      </p>

      <h2>What you generate</h2>
      <p>
        You own the output your account generates and may use it commercially, including in paid
        advertising. Two limits worth stating plainly: AI output may not be copyrightable in every
        country, and similar briefs can produce similar results for other customers, so we cannot
        promise your output is unique.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Blink UGC to make deceptive advertising, to impersonate a real person or brand you
        do not represent, to produce sexual, hateful or violent content, or to break the law or the
        advertising rules of the platform you post to. We may suspend an account that does.
      </p>

      <h2>Plans, billing and allowances</h2>
      <p>
        Paid plans are billed monthly or annually in advance through Gumroad, and renew until
        cancelled. Each plan includes a monthly allowance of generated video and images, stated on
        the pricing page; allowances reset each billing month and do not roll over. Promotional
        pricing applies for as long as stated at the time you subscribe.
      </p>

      <h2>Cancelling and refunds</h2>
      <p>
        Cancel at any time from your account; you keep access until the end of the period you have
        paid for, then drop to the free tier and keep everything you have made. Because generation
        spends real compute the moment you run it, we do not refund used allowance — but if
        something is genuinely broken on our side, email us and we will make it right.
      </p>

      <h2>Availability</h2>
      <p>
        We do not promise uninterrupted service. We depend on third-party model providers, and a
        model being deprecated, rate-limited or unavailable can interrupt generation.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. To the extent the law allows, our total
        liability to you is limited to what you paid us in the twelve months before the claim, and
        we are not liable for lost profits, lost ad spend or lost data. Nothing here excludes
        liability that cannot legally be excluded.
      </p>

      <h2>Ending it</h2>
      <p>
        You can stop using Blink UGC and delete your account at any time. We may suspend or close an
        account that breaks these terms, and will tell you why where we can.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top changes, and continuing to use the service
        after a significant change means accepting it.
      </p>

      <h2>Contact</h2>
      <p>
        {/* ENTITY — replace with the registered company name, address and governing law. */}
        Blink UGC — <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </Shell>
  )
}

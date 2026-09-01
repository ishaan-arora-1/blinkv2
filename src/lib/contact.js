/**
 * Where an enquiry goes.
 *
 * One constant, in one file, because it appears on the pricing page, the
 * landing page and anywhere else that ever needs to say "talk to us" — and an
 * address that is right in two places and stale in a third is how a lead goes
 * quietly missing.
 */
export const CONTACT_EMAIL = 'hello@blinkugc.com'

/**
 * A mailto for someone asking about a plan we cannot sell them off the shelf.
 *
 * The subject names the plan so the reply does not have to start by asking
 * which one they meant, and the body is prefilled with the two things that
 * decide the answer: how much video, and how they want to be billed.
 */
export function enquiryHref(planName = 'a custom plan') {
  const subject = `Blink UGC — ${planName} enquiry`
  const body = [
    `Hi — I'd like to talk about ${planName}.`,
    '',
    'Roughly how much video I need a month:',
    'How I would like to be billed (annual invoice, PO, other):',
    'Anything else:',
  ].join('\n')
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

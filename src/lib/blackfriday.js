/**
 * The Black Friday offer, in one place so it can be switched off in one place.
 *
 * `regular` is what each tier costs when the sale ends. The live price in the
 * plans table IS the sale price — nothing here discounts at checkout, it only
 * states what the price goes back to. That makes the struck-through number a
 * promise about December, not a decoration: if the plans are not actually
 * repriced to these on the 1st, the page has been lying, so either honour them
 * or set `on` to false.
 */
export const BLACK_FRIDAY = {
  on: true,
  label: 'Black Friday',
  endsNote: 'Back to full price on 1 December',
  // tier → what it returns to. Keyed by tier so the annual rows inherit it too.
  regular: { creator: 39, studio: 99, agency: 249 },
}

/** The percentage off, worked out rather than asserted, so the two agree. */
export function savingFor(tier, price) {
  const was = BLACK_FRIDAY.regular[tier]
  if (!BLACK_FRIDAY.on || !was || !price || price >= was) return null
  return { was, off: Math.round((1 - price / was) * 100) }
}

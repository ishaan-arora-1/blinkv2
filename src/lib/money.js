/**
 * Currency formatting, driven entirely by what the plan says.
 *
 * Every price in the UI used to have a hardcoded ₹ in front of it. The moment
 * the Razorpay plans were created in USD, the app was quoting one currency
 * while the gateway charged another — which is a chargeback, not a typo. The
 * currency now travels with the amount from the database, and nothing is
 * allowed to assume a symbol.
 */

const cache = new Map()

function formatter(currency, opts) {
  const key = `${currency}:${opts.maximumFractionDigits}`
  if (!cache.has(key)) {
    // narrowSymbol keeps it "$7.99" rather than "US$7.99". Without it the
    // prefix depends on the viewer's locale, so the same price reads
    // differently for a customer in London and one in Mumbai.
    const base = { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...opts }
    let fmt
    try {
      fmt = new Intl.NumberFormat(undefined, base)
    } catch {
      // Older engines reject narrowSymbol outright.
      fmt = new Intl.NumberFormat(undefined, { ...base, currencyDisplay: 'symbol' })
    }
    cache.set(key, fmt)
  }
  return cache.get(key)
}

/**
 * @param {number} amount   in major units (7.99, not 799)
 * @param {string} currency ISO code — 'USD', 'INR', …
 */
export function money(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(amount)) return ''

  // Whole amounts read better without the trailing .00 on a pricing card, but
  // 7.99 must never be shown as 8.
  const whole = Number.isInteger(amount)
  try {
    return formatter(currency, {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount)
  } catch {
    // Unknown or malformed currency code — show the number rather than nothing.
    return `${amount} ${currency}`
  }
}

/** The per-month equivalent of a yearly price, for comparison copy. */
export function perMonth(yearlyAmount, currency = 'USD') {
  return money(Math.round((yearlyAmount / 12) * 100) / 100, currency)
}

import { admin } from './supabase.js'
import { allowanceFor } from './entitlements.js'

/**
 * The video allowance, and the one place that counts it.
 *
 * Counted in SECONDS OF FINISHED VIDEO. That is the unit fal bills in — $0.10
 * a second with audio off — so it is the only one that stays honest as the
 * product changes. The previous meter counted clips, which cost forty cents at
 * four seconds and eighty at eight while spending the same single credit: the
 * longer clip was strictly better for the customer and strictly worse for us,
 * and nobody had to notice that to take it.
 *
 * It is also the unit a buyer understands. "Two minutes a month" needs no
 * footnote, where "25 videos a month" turned out to mean about six once each
 * one was four scenes long.
 *
 * The allowance is per tier — see ALLOWANCE in entitlements.js — rather than a
 * single environment variable, because there are now three plans and the number
 * is what separates two of them.
 */

/**
 * The event kind seconds are recorded under.
 *
 * Deliberately not the old 'blink.generate'. Those rows carry a cost_units of 1
 * meaning one clip, and summing them together with rows where 1 means one
 * second would quietly undercount every historical generation by a factor of
 * eight. A new kind keeps the two units from ever being added up.
 */
export const CREDIT_KIND = 'video.seconds'

/** Start of the current calendar month, UTC — the window the cap is counted in. */
export function monthStart() {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** The 1st of next month, UTC — what the copy means by "resets". */
export function resetsAt() {
  const start = monthStart()
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString()
}

/**
 * Seconds of video this account has spent this month.
 *
 * Summed from generation_events rather than from the reels themselves, for the
 * reason 0017 gives: a reel can be deleted by its owner, and an allowance you
 * can reset by emptying your own library is not an allowance. The event is
 * written only once the vendor has accepted the request, so a scene that failed
 * before it cost anything does not come out of it.
 */
export async function usedThisMonth(userId) {
  const { data, error } = await admin
    .from('generation_events')
    .select('cost_units')
    .eq('user_id', userId)
    .eq('kind', CREDIT_KIND)
    .gte('created_at', monthStart().toISOString())

  if (error) throw new Error(error.message)
  return (data || []).reduce((n, row) => n + (row.cost_units || 0), 0)
}

/**
 * { usedSeconds, limitSeconds, remainingSeconds, resetsAt } — the shape the
 * form and the composer both read before anyone spends anything, because
 * finding out you are out of video by being refused is a bad way to find out.
 */
export async function usage(userId, tier) {
  const used = await usedThisMonth(userId)
  const limit = allowanceFor(tier).videoSeconds
  return {
    usedSeconds: used,
    limitSeconds: limit,
    remainingSeconds: Math.max(0, limit - used),
    resetsAt: resetsAt(),
  }
}

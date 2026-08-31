import { admin } from './supabase.js'
import { env } from './env.js'

/**
 * The Growth video allowance, and the one place that counts it.
 *
 * This used to live inside routes/veo.js, which was correct while Blink AI was
 * the only thing spending it. Multiframe spends the same allowance — a scene is
 * a Veo clip, billed and rendered exactly like a Blink one — so the counter has
 * to be shared or the two routes will eventually disagree about what somebody
 * has left.
 *
 * One allowance rather than two on purpose. The cost to us is per clip, so a
 * budget denominated in clips is the only one that stays true when the mix of
 * features changes; a separate multiframe cap would be a second number to keep
 * in step with the pricing page, and the first one is already hard enough (see
 * 0017 — BLINK_MONTHLY_LIMIT and the plans row have to move together).
 */
export const MONTHLY_LIMIT = env.blinkMonthlyLimit

/**
 * Every event kind that draws down the allowance.
 *
 * Multiframe scenes are recorded under the same 'blink.generate' kind rather
 * than a kind of their own. The kind names what was spent, not what spent it —
 * one Veo clip either way — and keeping them identical means the count is a
 * single equality rather than an `in` list that someone has to remember to
 * extend the next time a feature renders video. What it was for is in `meta`.
 */
export const CREDIT_KIND = 'blink.generate'

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
 * How many clips this account has spent this month.
 *
 * Counted from generation_events rather than from the rows the clips belong to,
 * for the reason 0017 gives: a blink or a reel can be deleted by its owner, and
 * a cap you can reset by emptying your own library is not a cap. The event is
 * written only once the vendor has accepted the request, so a generation that
 * failed before it cost anything does not come out of the allowance.
 */
export async function usedThisMonth(userId) {
  const { count } = await admin
    .from('generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', CREDIT_KIND)
    .gte('created_at', monthStart().toISOString())
  return count ?? 0
}

/** { used, limit, remaining, resetsAt } — the shape both routes report. */
export async function usage(userId) {
  const used = await usedThisMonth(userId)
  return {
    used,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - used),
    resetsAt: resetsAt(),
  }
}

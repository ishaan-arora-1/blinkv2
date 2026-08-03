import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { planBilling } from '../planMode.js'
import { wrap } from '../middleware/errors.js'

export const plansRouter = Router()

/**
 * Public — the pricing page renders before sign-in.
 *
 * The razorpay plan ids are deliberately not exposed. They are an internal
 * mapping, and the checkout flow never needs them: the client picks a plan by
 * our id and the server resolves it.
 *
 * The price quoted here is the one belonging to the current Razorpay mode, so
 * the page can never advertise a live amount that a test key would not charge.
 */
plansRouter.get(
  '/',
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from('plans')
      .select(
        'id, name, blurb, tier, rank, price_minor, price_minor_test, razorpay_plan_id, razorpay_plan_id_test, currency, period, interval, features, sort'
      )
      .eq('active', true)
      .order('sort', { ascending: true })

    if (error) throw new Error(error.message)

    res.json({
      // Lets the pricing page explain why the buttons are inert, rather than
      // letting the user click through to a 503.
      billingEnabled: env.razorpay.configured,
      plans: (data || []).map((p) => {
        const { priceMinor } = planBilling(p)
        return {
          id: p.id,
          name: p.name,
          blurb: p.blurb,
          tier: p.tier,
          rank: p.rank,
          // Major units for display, minor units for anything that must be exact.
          // Currency travels with them — the client must never assume a symbol.
          price: priceMinor / 100,
          priceMinor,
          currency: p.currency,
          period: p.period,
          interval: p.interval,
          features: p.features,
        }
      }),
    })
  })
)

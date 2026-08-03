import { Router } from 'express'
import { admin } from '../supabase.js'
import { env } from '../env.js'
import { wrap } from '../middleware/errors.js'

export const plansRouter = Router()

/**
 * Public — the pricing page renders before sign-in.
 *
 * razorpay_plan_id is deliberately not exposed. It is an internal mapping, and
 * the checkout flow never needs it: the client picks a plan by our id and the
 * server resolves it.
 */
plansRouter.get(
  '/',
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from('plans')
      .select('id, name, blurb, tier, rank, price_paise, currency, period, interval, features, sort')
      .eq('active', true)
      .order('sort', { ascending: true })

    if (error) throw new Error(error.message)

    res.json({
      // Lets the pricing page explain why the buttons are inert, rather than
      // letting the user click through to a 503.
      billingEnabled: env.razorpay.configured,
      plans: (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        blurb: p.blurb,
        tier: p.tier,
        rank: p.rank,
        price: p.price_paise / 100,
        pricePaise: p.price_paise,
        currency: p.currency,
        period: p.period,
        interval: p.interval,
        features: p.features,
      })),
    })
  })
)

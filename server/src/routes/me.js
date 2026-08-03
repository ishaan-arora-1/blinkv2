import { Router } from 'express'
import { admin } from '../supabase.js'
import { resolveEntitlement } from '../entitlements.js'
import { wrap } from '../middleware/errors.js'

// requireAuth is applied where this router is mounted, so the rate limiter can
// key on req.user. Every route below can assume req.user exists.
export const meRouter = Router()

/**
 * Everything the client needs to decide what to render: who you are, what you
 * are allowed to do, and why.
 */
meRouter.get(
  '/',
  wrap(async (req, res) => {
    const [{ data: profile }, entitlement] = await Promise.all([
      admin
        .from('profiles')
        .select('id, email, full_name, avatar_url, trial_ends_at, created_at')
        .eq('id', req.user.id)
        .maybeSingle(),
      resolveEntitlement(req.user.id),
    ])

    res.json({
      user: {
        id: req.user.id,
        email: profile?.email || req.user.email,
        fullName: profile?.full_name || req.user.user_metadata?.full_name || null,
        avatarUrl: profile?.avatar_url || req.user.user_metadata?.avatar_url || null,
        createdAt: profile?.created_at || req.user.created_at,
      },
      entitlement,
    })
  })
)

/** Payment history for the account page. */
meRouter.get(
  '/payments',
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from('payments')
      .select('razorpay_payment_id, amount_minor, currency, status, method, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    res.json({
      payments: (data || []).map((p) => ({
        id: p.razorpay_payment_id,
        amount: p.amount_minor / 100,
        currency: p.currency,
        status: p.status,
        method: p.method,
        createdAt: p.created_at,
      })),
    })
  })
)

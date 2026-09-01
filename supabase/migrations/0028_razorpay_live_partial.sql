-- ============================================================================
-- Blink UGC · 0028_razorpay_live_partial
--
-- The two live plans that were created correctly, and nothing else.
--
-- Five were made in the dashboard; three were wrong in ways that only a machine
-- reading them back would catch, and two of those would have taken money:
--
--   Creator Annual  period "monthly" — $190 every month, not once a year
--   Studio Annual   period "monthly" — $490 every month, not once a year
--   Agency          currency INR     — ₹129, about a dollar fifty, not $129
--
-- Razorpay plans are immutable: amount, currency and period cannot be edited
-- after creation, so those three have to be deleted and remade. Until they are,
-- they are deactivated here rather than left on the page with a null id — an
-- inactive plan is absent, where an active one with no live id sends a customer
-- to an error that reads like our bug.
--
-- This is the second time reading the ids back from the API rather than the
-- screen has caught something: 0025's note was about transcription, and this
-- one is about the dashboard form defaulting a yearly plan to monthly.
-- ============================================================================

update public.plans set razorpay_plan_id = 'plan_TWtlFTwj9DEfcp' where id = 'creator';
update public.plans set razorpay_plan_id = 'plan_TWtlb1BiAiW4i7' where id = 'studio';

-- Nothing correct exists in live mode for these three yet.
update public.plans set active = false where id in ('agency', 'creator_annual', 'studio_annual');

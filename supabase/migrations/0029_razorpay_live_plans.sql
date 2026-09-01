-- ============================================================================
-- Blink UGC · 0029_razorpay_live_plans
--
-- All five live plans, verified and wired.
--
-- The three remade after 0028 are correct: Agency in USD rather than INR, and
-- both annuals on a yearly period rather than the monthly the dashboard form
-- defaults to. Each was checked back through GET /v1/plans on name, currency,
-- amount, period and interval before being written here — the two mistakes this
-- catches were invisible on the screen and would have charged $190 and $490 a
-- month to people expecting a year.
--
-- The wrong plans are left alone in Razorpay. They cannot be deleted, nothing
-- references them, and an id that appears in no row cannot be charged.
--
-- Agency Annual is still absent by design: at $1,290 it exceeds the account's
-- ~$525 international transaction limit, so it is sold as an enquiry until
-- support raises that. See 0026.
-- ============================================================================

update public.plans set razorpay_plan_id = 'plan_TWtlFTwj9DEfcp' where id = 'creator';
update public.plans set razorpay_plan_id = 'plan_TWtlb1BiAiW4i7' where id = 'studio';
update public.plans set razorpay_plan_id = 'plan_TWtx1RRZ6tHZx3' where id = 'agency';
update public.plans set razorpay_plan_id = 'plan_TWtw7awId2r9J4' where id = 'creator_annual';
update public.plans set razorpay_plan_id = 'plan_TWtwcNZv7WfzgC' where id = 'studio_annual';

-- Back on the page, now that each has a live plan behind it.
update public.plans set active = true where id in ('agency', 'creator_annual', 'studio_annual');

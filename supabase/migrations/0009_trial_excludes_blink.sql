-- The trial handed out the top tier, which meant seven days of free Google Veo
-- generations to anyone with an email address. Veo is metered and billed per
-- second of output, so that is the one feature where an unpaid account can run
-- up a real cost, and it was the easiest thing in the product to abuse.
--
-- The trial now grants Starter: carousels and hook videos, both of which cost
-- nothing per use. Blink AI requires an actual Growth subscription.
--
-- Deliberately hardcoded rather than read from plans.rank: this is a policy
-- decision about what a trial is worth, not a fact about the plan table, and it
-- should not silently change if a new tier is added above Growth.

create or replace function public.entitled_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.tier
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.user_id = p_user_id
        and s.status in ('active', 'authenticated', 'pending')
        and (s.current_end is null or s.current_end > now())
      order by p.rank desc
      limit 1
    ),
    (
      select 'starter'
      from public.profiles pr
      where pr.id = p_user_id
        and pr.trial_ends_at > now()
    ),
    'none'
  );
$$;

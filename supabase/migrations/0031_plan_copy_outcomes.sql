-- ============================================================================
-- Blink UGC · 0031_plan_copy_outcomes
--
-- The plan features described the machinery, not what you end up with. Nobody
-- buys "animated carousel slides"; they buy posts that go out. Same allowance,
-- named as the thing it produces:
--
--   "60 animated carousel slides a month"  → "60 Instagram posts a month"
--   "Unlimited photo carousels"            → "Unlimited Instagram posts"
--
-- The counts are untouched — a slide is a post here, because a carousel is
-- published as one post and the meter has always counted slides.
--
-- Keyed on the pattern rather than plan id for the same reason as 0030: the
-- line appears on five rows including the annuals, and agency_annual is
-- inactive and invisible to /api/plans.
-- ============================================================================

create or replace function pg_temp.recopy(p_features jsonb)
returns jsonb
language sql
as $$
  select jsonb_agg(
           case
             when e #>> '{}' ~ '^[0-9]+ animated carousel slides a month'
               then to_jsonb(regexp_replace(e #>> '{}',
                      '^([0-9]+) animated carousel slides a month',
                      '\1 Instagram posts a month'))
             when e #>> '{}' = 'Unlimited photo carousels'
               then to_jsonb('Unlimited Instagram posts'::text)
             else e
           end
           order by ord
         )
    from jsonb_array_elements(p_features) with ordinality as t(e, ord);
$$;

update public.plans set features = pg_temp.recopy(features);

-- Nothing customer-facing should still be selling slides or carousels.
do $$
declare n integer;
begin
  select count(*) into n
    from public.plans, jsonb_array_elements(features) e
   where active
     and (e #>> '{}' ilike '%carousel%' or e #>> '{}' ilike '%slides a month%');
  if n > 0 then
    raise exception 'plan copy still sells carousels or slides on % line(s)', n;
  end if;
end $$;

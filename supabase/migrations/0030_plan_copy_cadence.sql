-- ============================================================================
-- Blink UGC · 0030_plan_copy_cadence
--
-- "2 minutes of finished video a month" is the line Studio is bought on, and it
-- reads as almost nothing. It is the same allowance either way — this changes
-- what it is called, not what it buys.
--
-- Cadence, and an explicit length, because the two have to agree with the
-- meter. The server counts SECONDS (ALLOWANCE in entitlements.js: studio 120,
-- agency 360), so the numbers here land on it exactly rather than roughly:
--
--   Studio   4 ads × 30s = 120s   → "a new 30-second ad every week"
--   Agency  12 ads × 30s = 360s   → "three new 30-second ads a week"
--
-- Saying "every other day" for Agency would have been 15 ads, or 450s — ninety
-- seconds more than the plan grants, and a promise the meter would break in the
-- last week of the month. Naming the 30 seconds is what keeps the cadence
-- honest: without it, somebody filming the full 48 seconds a reel allows reads
-- "a new ad every week" and gets two. Agency keeps "Roughly 7 full-length
-- reels, or 11 shorter ones" underneath, which is the same qualification from
-- the other end.
--
-- Keyed on TIER, not on plan id. The first draft of this listed studio,
-- studio_annual and agency, and the guard at the bottom caught agency_annual —
-- inactive since 0026 because $1,290 is over the account's transaction limit,
-- so it is invisible to /api/plans and to the pre-flight check that read from
-- it. It is still a row somebody can reactivate, and it would have come back
-- with copy two versions old. Tier covers every variant, including the annuals
-- and anything added later.
--
-- Matched on the text rather than an array index: the Blink AI line is second
-- on the monthly rows but third on the annuals, behind "Two months free", and
-- an index that is right today silently corrupts an unrelated feature the next
-- time a line is inserted above it.
-- ============================================================================

create or replace function pg_temp.recopy(p_features jsonb, p_new text)
returns jsonb
language sql
as $$
  select jsonb_agg(
           case when e #>> '{}' like 'Blink AI — % minutes of finished video a month'
                then to_jsonb(p_new)
                else e
           end
           order by ord
         )
    from jsonb_array_elements(p_features) with ordinality as t(e, ord);
$$;

update public.plans
   set features = pg_temp.recopy(features, 'Blink AI — a new 30-second ad every week')
 where tier = 'studio';

update public.plans
   set features = pg_temp.recopy(features, 'Blink AI — three new 30-second ads a week')
 where tier = 'agency';

-- Blurbs are per row rather than per tier: the annuals have to keep their own
-- "two months free" ending.
update public.plans set blurb = 'A new narrated, subtitled ad every week — start to finish.'
 where id = 'studio';
update public.plans set blurb = 'A new ad every week — two months free on annual.'
 where id = 'studio_annual';
update public.plans set blurb = 'Three new ads a week — for shipping constantly.'
 where id = 'agency';
update public.plans set blurb = 'Three new ads a week — two months free on annual.'
 where id = 'agency_annual';

-- Nothing anywhere should still be selling the feature in minutes. Active or
-- not: a retired row that gets switched back on is exactly how stale copy
-- returns to the page.
do $$
declare n integer;
begin
  select count(*) into n
    from public.plans, jsonb_array_elements(features) e
   where e #>> '{}' like '%minutes of finished video%';
  if n > 0 then
    raise exception 'plan copy still measures Blink AI in minutes on % row(s)', n;
  end if;

  select count(*) into n from public.plans where blurb ilike '%minutes a month%'
                                              or blurb ilike '%minutes of finished%';
  if n > 0 then
    raise exception 'plan blurb still measures Blink AI in minutes on % row(s)', n;
  end if;
end $$;

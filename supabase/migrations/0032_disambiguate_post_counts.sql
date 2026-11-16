-- ============================================================================
-- Blink UGC · 0032_disambiguate_post_counts
--
-- 0031 renamed two different things to the same name. Creator ended up reading
-- "Unlimited Instagram posts" directly above "60 Instagram posts a month",
-- which is a contradiction on the pricing page and a support ticket waiting to
-- happen.
--
-- They were never the same product. One lays copy over photography and bills
-- nobody, so it is unlimited. The other draws every slide to order and costs us
-- per image, so it is metered. The names now say which is which without
-- reintroducing the word "carousel".
-- ============================================================================

create or replace function pg_temp.recopy(p_features jsonb)
returns jsonb
language sql
as $$
  select jsonb_agg(
           case
             when e #>> '{}' ~ '^[0-9]+ Instagram posts a month'
               then to_jsonb(regexp_replace(e #>> '{}',
                      '^([0-9]+) Instagram posts a month',
                      '\1 AI-illustrated posts a month'))
             else e
           end
           order by ord
         )
    from jsonb_array_elements(p_features) with ordinality as t(e, ord);
$$;

update public.plans set features = pg_temp.recopy(features);

do $$
declare n integer;
begin
  -- No active plan may offer "unlimited X" and "N X a month" under one name.
  select count(*) into n from public.plans p
   where p.active
     and exists (select 1 from jsonb_array_elements(p.features) e
                  where e #>> '{}' = 'Unlimited Instagram posts')
     and exists (select 1 from jsonb_array_elements(p.features) e
                  where e #>> '{}' ~ '^[0-9]+ Instagram posts a month');
  if n > 0 then
    raise exception 'plan still promises unlimited and a monthly cap of the same thing on % row(s)', n;
  end if;
end $$;

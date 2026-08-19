-- One-off cleanup for the 2026-08-18 incident.
--
-- An account inserted ~22.6 million synthetic rows into `brands`, all shaped
-- like:
--
--   app_name "ScaleBrand 10499923"
--   tagline  "Premium product engineered for 100M scale #10499923"
--
-- Not a migration — it repairs data on one deployment rather than describing
-- the schema, so it does not belong in supabase/migrations/. Run it by hand in
-- the Supabase SQL editor. The permanent guard against a repeat is migration
-- 0016_insert_rate_caps.sql; apply that one first, or the loop below will be
-- racing whatever is still inserting.
--
-- Safe to interrupt and safe to run twice. It commits per batch and selects
-- only rows still matching, so a second run resumes where the first stopped
-- instead of starting over.
--
-- Two things it deliberately does NOT do:
--
--   * It matches on the `ScaleBrand ` name pattern rather than deleting
--     everything the account owns. If any of those rows are a real brand the
--     person typed, they survive.
--   * It does not touch carousels or videos. Their brand_id is
--     `on delete set null` (migration 0011), so their rows are left intact with
--     a null brand rather than cascade-deleted.

-- ============================================================================
-- 1. Look before deleting
-- ============================================================================
-- Run this on its own first. `count(*)` on 22M rows will not finish inside the
-- default statement timeout, so this asks the cheaper question — what do the
-- rows look like, and are any of them real?

select app_name, tagline, created_at
  from public.brands
 where user_id = '4466d2c5-c7ae-4ed2-a67f-42ae8add1542'
 limit 20;

-- Anything owned by that account that is NOT synthetic. Expect a small number,
-- or none. These are the rows the purge is written to preserve.
select id, app_name, created_at
  from public.brands
 where user_id = '4466d2c5-c7ae-4ed2-a67f-42ae8add1542'
   and app_name not like 'ScaleBrand %'
 limit 50;

-- ============================================================================
-- 2. The batched purge
-- ============================================================================

create or replace procedure public.purge_scale_test_brands(
  p_user_id uuid,
  p_batch   int default 5000
)
language plpgsql
as $$
declare
  n     int;
  total bigint := 0;
begin
  loop
    -- Deleting by a LIMITed subquery of ids keeps each statement small. One
    -- 22M-row DELETE would hold a single transaction open for hours, write the
    -- whole thing to WAL before committing, and roll all of it back on any
    -- timeout — which is how a cleanup turns into a second outage.
    delete from public.brands
     where id in (
       select id
         from public.brands
        where user_id = p_user_id
          and app_name like 'ScaleBrand %'
        limit p_batch
     );

    get diagnostics n = row_count;
    total := total + n;

    -- Committing inside the loop is the point of this being a procedure rather
    -- than a DO block: each batch is durable on its own, so an interruption
    -- costs one batch instead of everything.
    commit;

    raise notice 'purged % rows (running total %)', n, total;
    exit when n = 0;
  end loop;

  raise notice 'done — % rows removed', total;
end;
$$;

-- The CALL is a single statement, so the session timeout has to come off or it
-- will be cut short partway. Per-batch commits mean that is survivable, but
-- there is no reason to fight it.
set statement_timeout = 0;

call public.purge_scale_test_brands('4466d2c5-c7ae-4ed2-a67f-42ae8add1542');

-- ============================================================================
-- 3. Afterwards
-- ============================================================================
-- A delete of this size leaves the table physically enormous and its planner
-- statistics badly wrong — queries stay slow until both are fixed. Autovacuum
-- gets there eventually; on a table this shape it is worth not waiting.
--
-- VACUUM cannot run inside a transaction block, so run this on its own.
--
--   vacuum (analyze, verbose) public.brands;
--
-- FULL reclaims the disk back to the filesystem but takes an ACCESS EXCLUSIVE
-- lock for the duration — nothing can read or write the table while it runs.
-- Worth it once, off-peak, and only if disk is the pressing problem:
--
--   vacuum full public.brands;

-- Housekeeping: the procedure has served its purpose once the table is clean.
-- drop procedure public.purge_scale_test_brands(uuid, int);

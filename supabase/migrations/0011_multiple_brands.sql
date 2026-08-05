-- Multiple brands per account.
--
-- `brands.user_id` was the primary key, so the schema itself allowed exactly
-- one brand per user. That is fine for someone marketing a single product and
-- wrong for an agency, a founder with two products, or anyone who wants to try
-- a second positioning without overwriting the first.
--
-- The table keeps its shape; only the key changes. Every existing row becomes
-- that user's first brand, so nothing has to be migrated or re-entered.

-- ============================================================================
-- brands: a real primary key
-- ============================================================================

alter table public.brands
  add column if not exists id uuid not null default gen_random_uuid();

-- Nothing references brands(user_id) — the app has always looked brands up by
-- user_id as a value rather than joining to it — so the old key can simply go.
alter table public.brands drop constraint if exists brands_pkey;
alter table public.brands add primary key (id);

create index if not exists brands_user_idx on public.brands (user_id, created_at);

-- The signup trigger still creates one brand per new account, which is now that
-- account's first brand rather than its only one.

-- A user may now have brands worth removing. There was no delete policy before
-- because there was nothing to delete: the single row was created by a trigger
-- and deleting it would have broken onboarding.
drop policy if exists "brands: owner deletes" on public.brands;
create policy "brands: owner deletes" on public.brands
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Work remembers the brand it was made for
-- ============================================================================
--
-- Without this, opening an old carousel after switching brands would re-roll
-- its hook using whichever brand happens to be selected — a carousel for one
-- product quietly rewriting itself in another product's name. The editor reads
-- the brand off the row, not off the current selection.
--
-- Nullable, and null on every existing row: those were made when an account had
-- exactly one brand, so the answer is unambiguous without storing it. The
-- backfill below sets them anyway, because "the user's only brand" stops being
-- a safe assumption the moment they create a second one.

alter table public.carousels add column if not exists brand_id uuid
  references public.brands(id) on delete set null;

alter table public.videos add column if not exists brand_id uuid
  references public.brands(id) on delete set null;

update public.carousels c
   set brand_id = b.id
  from public.brands b
 where b.user_id = c.user_id
   and c.brand_id is null;

update public.videos v
   set brand_id = b.id
  from public.brands b
 where b.user_id = v.user_id
   and v.brand_id is null;

create index if not exists carousels_brand_idx on public.carousels (brand_id);
create index if not exists videos_brand_idx on public.videos (brand_id);

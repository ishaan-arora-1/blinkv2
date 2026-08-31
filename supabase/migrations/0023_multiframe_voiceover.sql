-- ============================================================================
-- Blink UGC · 0023_multiframe_voiceover
--
-- One voice over the whole reel, and a place to keep every cut.
--
-- Veo generates audio inside each clip, which is right for Blink AI — a single
-- eight-second shot — and wrong for a reel. Each scene is an independent
-- generation with no shared voice identity, so a four-scene reel came back in
-- four different voices, and a sentence could never carry across a cut because
-- every clip's audio restarted at the join. The clips are therefore silent now,
-- and the narration is synthesised once, from the script, and laid over the
-- whole thing.
--
-- Editing it costs nothing: rewriting a line re-synthesises in seconds for a
-- fraction of a cent, where changing a word of Veo's dialogue meant re-filming
-- a scene at one of the month's twenty-five.
-- ============================================================================

alter table public.multiframes
  -- Which ElevenLabs voice read it. Kept so a re-synthesis after a script edit
  -- comes back in the same voice rather than silently recasting the ad.
  add column if not exists voice_id text,
  add column if not exists vo_path text,
  add column if not exists vo_duration_seconds real,
  -- Word-level timings from the TTS model. This is what makes subtitles honest:
  -- they are cut from when each word is actually spoken rather than from an
  -- even division of the script across the runtime, which drifts within a
  -- sentence and is visibly wrong by the end of a long one.
  add column if not exists vo_words jsonb,
  -- Where the narration starts relative to the picture. A reel usually wants a
  -- beat of silence before anyone speaks.
  add column if not exists vo_offset_seconds real not null default 0;

-- How long this scene is held in the combined cut.
--
-- Null means "all of it". The clip is whatever Veo rendered and cannot be
-- changed without paying to film it again, but how much of it survives the edit
-- is free, and it is the only lever there is for making the picture match the
-- length of the narration.
alter table public.multiframe_scenes
  add column if not exists trim_seconds real;

-- ============================================================================
-- The cuts
-- ============================================================================
--
-- Every finished version of the reel, kept side by side rather than in place.
--
-- Adding subtitles does not replace the cut without them, and adding narration
-- does not replace the silent join: they are three different deliverables and
-- somebody may want any of them. Unique on (reel, kind) so re-rendering a kind
-- refreshes that one and leaves the others alone.
--
-- These are produced in the browser — the compositor records the canvas — so
-- unlike everything else Multiframe stores, the client writes them, and they
-- live in the uploads bucket where its own policies already allow it. That is
-- also why this table has owner insert and update policies where the frame and
-- scene tables deliberately have none: a fabricated render is a video somebody
-- made for themselves, not a generation they avoided paying for.

create table if not exists public.multiframe_renders (
  id               uuid primary key default gen_random_uuid(),
  multiframe_id    uuid not null references public.multiframes(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,

  kind             text not null check (kind in ('plain', 'voiceover', 'subtitled')),
  storage_path     text not null,
  duration_seconds real,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (multiframe_id, kind)
);

create index if not exists multiframe_renders_reel_idx
  on public.multiframe_renders (multiframe_id);

create index if not exists multiframe_renders_user_idx
  on public.multiframe_renders (user_id, created_at desc);

create trigger multiframe_renders_updated_at
  before update on public.multiframe_renders
  for each row execute function public.set_updated_at();

alter table public.multiframe_renders enable row level security;

create policy "multiframe_renders: owner reads" on public.multiframe_renders
  for select using (auth.uid() = user_id);
create policy "multiframe_renders: owner writes" on public.multiframe_renders
  for insert with check (auth.uid() = user_id);
create policy "multiframe_renders: owner updates" on public.multiframe_renders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "multiframe_renders: owner deletes" on public.multiframe_renders
  for delete using (auth.uid() = user_id);

-- Client-writable, so it takes both halves of the guard from 0016 and 0018,
-- like every other table an authenticated client may insert into.
drop trigger if exists multiframe_renders_insert_rate_cap on public.multiframe_renders;
create trigger multiframe_renders_insert_rate_cap
  before insert on public.multiframe_renders
  for each row execute function public.enforce_insert_rate_cap(120);

drop trigger if exists multiframe_renders_insert_rate_cap_stmt on public.multiframe_renders;
create trigger multiframe_renders_insert_rate_cap_stmt
  after insert on public.multiframe_renders
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

-- ============================================================================
-- The generations bucket has to accept audio now
-- ============================================================================
--
-- It was created for video and extended for images in 0010; the narration is
-- an mp3 and would otherwise fail with "mime type audio/mpeg is not supported"
-- after the voice had already been generated and paid for. The existing
-- policies already say the right thing — service-role writes, owner reads — so
-- only the mime list moves.

update storage.buckets
   set allowed_mime_types = array[
     'video/mp4', 'video/webm',
     'image/png', 'image/jpeg', 'image/webp',
     'audio/mpeg', 'audio/mp3', 'audio/wav'
   ]
 where id = 'generations';

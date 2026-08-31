-- ============================================================================
-- Blink UGC · 0019_multiframe
--
-- Multiframe: one idea becomes a multi-scene reel.
--
-- Blink AI renders a single clip from a single prompt. That ceiling is the
-- product's real limit — 8 seconds is a shot, not an ad. Multiframe splits an
-- idea into scenes, renders a still for each, drives a clip from each still,
-- and hands the browser the ordered set to play as one video.
--
-- Two tables rather than a jsonb column on one, for the reason 0010 gave for
-- carousel_slides and which applies harder here: every scene is an independent
-- vendor call that can land out of order or fail alone, and a six-scene reel is
-- six Veo generations of somebody's money. Losing five of them to the sixth
-- one's refusal is the outcome worth designing away.
-- ============================================================================

-- ============================================================================
-- The reel
-- ============================================================================

create table if not exists public.multiframes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- Nullable for the same reason animated carousels allow it: a brand can be
  -- deleted, and an orphaned reel should stay watchable.
  brand_id      uuid references public.brands(id) on delete set null,

  -- What the user typed. Kept verbatim — the scene split is derived from it and
  -- a re-split has to start from the same words, not from the last derivation.
  idea          text not null,
  name          text,

  -- Settings applied to every scene. Held on the reel, not per scene: a reel
  -- whose shots disagree about aspect ratio is not a reel.
  scene_count      integer not null default 4,
  aspect_ratio     text not null default '9:16',
  resolution       text not null default '720p',
  duration_seconds integer not null default 8,

  -- One voiceover for the whole reel, written once the scenes are known.
  -- Deliberately not per scene: the sketch this came from has a single script
  -- box after the combine step, and a narration written per shot reads as a
  -- list of captions rather than as a script.
  script        text,

  -- 'scripting' is its own state rather than being folded into 'rendering'.
  -- The split runs before a single frame is generated and takes a few seconds,
  -- and "Planning your scenes" is a truer thing to show than a progress bar
  -- sitting at 0 of 4.
  status        text not null default 'pending'
                  check (status in ('pending','scripting','rendering','ready','failed')),
  error         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists multiframes_user_idx
  on public.multiframes (user_id, created_at desc);

create index if not exists multiframes_rendering_idx
  on public.multiframes (status) where status in ('pending','scripting','rendering');

create trigger multiframes_updated_at
  before update on public.multiframes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- The scenes
-- ============================================================================
--
-- A scene carries two artefacts and therefore two halves of a lifecycle: the
-- still, then the clip driven from it. The status column names the seam because
-- the frame is worth showing the moment it lands — it is the first evidence
-- that the split understood the idea, and it arrives roughly a minute before
-- the clip does.

create table if not exists public.multiframe_scenes (
  id             uuid primary key default gen_random_uuid(),
  multiframe_id  uuid not null references public.multiframes(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,

  -- Position in the reel, 0-based. Unique per reel so re-rolling a scene
  -- replaces it rather than quietly appending a second copy.
  idx            integer not null,

  -- What this shot is, in the copy writer's words. Kept so a re-roll can
  -- regenerate the same moment instead of inventing a new one.
  description    text,
  -- What the still should look like, and what should move in it. Two fields
  -- because they go to two different models.
  frame_prompt   text,
  motion_prompt  text,

  frame_path     text,
  video_path     text,

  -- fal's status URL for this scene's clip. Stored rather than rebuilt from the
  -- model name: fal collapses the model sub-path in the URL it hands back, so a
  -- reconstructed one 404s. Same reason blinks.operation_name exists.
  operation_name text,

  status         text not null default 'pending'
                   check (status in ('pending','framing','frame_ready','rendering','ready','failed')),
  error          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (multiframe_id, idx)
);

create index if not exists multiframe_scenes_reel_idx
  on public.multiframe_scenes (multiframe_id, idx);

-- The background poller finds work through this: scenes with a clip in flight,
-- across every reel at once.
create index if not exists multiframe_scenes_polling_idx
  on public.multiframe_scenes (status) where status = 'rendering';

create trigger multiframe_scenes_updated_at
  before update on public.multiframe_scenes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row level security
-- ============================================================================
--
-- Read and delete for the owner, nothing else. These rows are written by the
-- server with the service role, exactly like blinks and carousel_slides: a
-- client that could insert one could fabricate a finished reel it never paid
-- for, and a client that could update one could move a scene to 'ready' and
-- point it at somebody else's storage path.

alter table public.multiframes       enable row level security;
alter table public.multiframe_scenes enable row level security;

create policy "multiframes: owner reads"   on public.multiframes
  for select using (auth.uid() = user_id);
create policy "multiframes: owner deletes" on public.multiframes
  for delete using (auth.uid() = user_id);

create policy "multiframe_scenes: owner reads"   on public.multiframe_scenes
  for select using (auth.uid() = user_id);
create policy "multiframe_scenes: owner deletes" on public.multiframe_scenes
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Insert rate cap
-- ============================================================================
--
-- Both halves of the guard from 0016 and 0018, applied to the reel but not to
-- its scenes.
--
-- The reel is one row per generation and is inserted one at a time, exactly
-- like blinks, so it takes the same 120/hour. Nothing legitimate comes close —
-- a reel is several minutes of rendering and is metered per clip besides — and
-- the trigger's predicate is served by multiframes_user_idx above.
--
-- multiframe_scenes is deliberately left uncapped, following carousel_slides.
-- Scenes are inserted as one statement of N rows by the service role at the
-- moment the split returns; a per-hour row cap on that is a cap on how many
-- reels an account may have, expressed in the wrong units and in the wrong
-- place. The reel's own cap already bounds it, and neither table has an insert
-- policy, so no client can reach either one directly.

drop trigger if exists multiframes_insert_rate_cap on public.multiframes;
create trigger multiframes_insert_rate_cap
  before insert on public.multiframes
  for each row execute function public.enforce_insert_rate_cap(120);

drop trigger if exists multiframes_insert_rate_cap_stmt on public.multiframes;
create trigger multiframes_insert_rate_cap_stmt
  after insert on public.multiframes
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

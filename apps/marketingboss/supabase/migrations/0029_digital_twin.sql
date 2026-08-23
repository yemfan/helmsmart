-- MarketingBoss — the digital twin: one row per user tying together the
-- likeness (portrait), the voice (an ElevenLabs voice id) and the intro video
-- both were derived from.
--
-- Why this table has to exist rather than reusing what was already here:
-- cloned voices were never persisted against a user. lib/voiceClone.ts posts a
-- sample to ElevenLabs, gets a voice_id back, and drops it; lib/voiceover.ts
-- then lists EVERY voice on the shared account and marks the cloned ones. So
-- one user's cloned voice appeared in every other user's picker. That is a
-- privacy problem, not just a tidiness one — a cloned voice is a person's
-- likeness. Ownership is recorded here so a twin's voice belongs to its owner.
--
-- Brand Kit stays in brand_kits. The twin is who the marketing sounds and looks
-- like; the brand kit is what it says. Joining them in one table would mean a
-- business with no on-camera presence still carries empty likeness columns.

create table if not exists public.digital_twins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Head-and-shoulders still. Drives the talking-avatar render (veed/fabric-1.0
  -- takes a portrait as INPUT, which is what lets a twin exist at all —
  -- Seedance refuses a human face as a reference).
  portrait_url text,
  -- The source clip a brand voice, a voice clone, or both were read from.
  intro_video_url text,
  -- ElevenLabs voice id belonging to THIS user. Null until they clone one.
  voice_id text,
  voice_name text,
  -- Explicit acknowledgement that the likeness and voice are their own. The
  -- render paths refuse without it; see lib/digitalTwin.ts.
  consent boolean not null default false,
  consent_at timestamptz,
  -- Most recent talking-avatar render, so the profile can show the twin rather
  -- than only describe it.
  avatar_video_url text,
  avatar_script text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digital_twins enable row level security;

-- Owner-only, read and write. No public-read policy: RLS policies are OR'd, so
-- adding one later would widen every owner query on this table.
create policy "own digital twin select" on public.digital_twins
  for select using (auth.uid() = user_id);
create policy "own digital twin insert" on public.digital_twins
  for insert with check (auth.uid() = user_id);
create policy "own digital twin update" on public.digital_twins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own digital twin delete" on public.digital_twins
  for delete using (auth.uid() = user_id);

create or replace function public.touch_digital_twin()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists digital_twins_touch on public.digital_twins;
create trigger digital_twins_touch
  before update on public.digital_twins
  for each row execute function public.touch_digital_twin();

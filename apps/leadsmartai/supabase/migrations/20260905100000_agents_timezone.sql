-- One timezone per account, in one column, named for what it is.
--
-- There have been three places claiming to hold an account's timezone:
--
--   agents.briefing_timezone              the real one, but named after the
--                                         ONE feature that happened to add it
--   voice_receptionist_settings.timezone  a leftover; not read, not written,
--                                         and holding a stale value that
--                                         actively misled a reader last week
--   (each caller's own `|| "America/Los_Angeles"` fallback)
--
-- The receptionist column is dropped: nothing selects it (SELECT_COLS in
-- lib/voice-receptionist/settings.ts names its columns explicitly and this is
-- not among them), and a stored value nothing reads is a value that can only
-- ever be wrong.
--
-- briefing_timezone is KEPT for now, deliberately. Deployed code still reads it,
-- and a column dropped while the old bundle is live is a 42703 on every
-- briefing. It is written alongside the new column until that code is gone,
-- then dropped in its own change.
alter table public.agents
  add column if not exists timezone text;

-- Backfill from the column that has been the real source, defaulting to the
-- value the code already defaults to so nothing changes for anyone.
update public.agents
set timezone = coalesce(nullif(btrim(briefing_timezone), ''), 'America/Los_Angeles')
where timezone is null;

alter table public.voice_receptionist_settings
  drop column if exists timezone;

comment on column public.agents.timezone is
  'The account timezone. Single source for briefings, the overnight run, the receptionist and booking. Region/City form (see lib/agent/timezone.ts).';

comment on column public.agents.briefing_timezone is
  'DEPRECATED — superseded by agents.timezone. Still written during rollout so deployed code keeps working; drop once nothing reads it.';

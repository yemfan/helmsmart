-- Activation email nudge dedup state.
--
-- The activation-nudge cron emails agents who signed up but haven't finished
-- setup (computed from real activation state). These columns bound how often we
-- nudge: at most a few times, spaced out, never after they've activated.

alter table public.agents
  add column if not exists activation_nudge_last_at timestamptz,
  add column if not exists activation_nudge_count integer not null default 0;

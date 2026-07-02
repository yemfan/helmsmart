-- Boss v2 proactive overnight mode (HANDOFF_BOSS_V2 PR-5).
-- Per-agent opt-in for the nightly autonomous run (local ~4am, stricter caps).
alter table public.agent_ai_settings
  add column if not exists overnight_mode boolean not null default false;

-- Per-assistant, per-channel autopilot for the Boss Assistant.
--
-- The global on/off lives on agent_message_settings.review_policy
-- ('autosend' = autopilot on). This table refines that per assistant +
-- channel: a row with mode 'auto' lets the Boss act on its own for that
-- (assistant, channel); 'ask' makes it propose for approval first. When no
-- row exists, the effective mode falls back to the global review policy.
create table if not exists public.boss_autopilot_settings (
  agent_id bigint not null references public.agents (id) on delete cascade,
  assignee text not null,
  channel text not null check (channel in ('call', 'sms', 'email', 'social')),
  mode text not null default 'ask' check (mode in ('ask', 'auto')),
  updated_at timestamptz not null default now(),
  primary key (agent_id, assignee, channel)
);

comment on table public.boss_autopilot_settings is
  'Per-assistant, per-channel autopilot mode for the Boss Assistant. ask = propose for the Realtor''s approval; auto = act autonomously. Falls back to agent_message_settings.review_policy when no row exists for a cell.';

-- Service-role only (the API reads/writes via supabaseAdmin); the session
-- client has no business-table access by design (see RLS posture).
alter table public.boss_autopilot_settings enable row level security;

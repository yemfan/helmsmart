-- Sales Assistant outreach composer — "Schedule for later".
--
-- An ad-hoc, fixed-batch outbound action queued for a future time. Distinct
-- from the rule-based Sphere scheduler (trigger_firings / message_drafts):
-- here the agent picks a channel, a concrete set of contacts, a message, and a
-- time; a */15 drain cron (/api/cron/outreach-scheduler) sends the batch when
-- it comes due, reusing the same send paths as the send-now composer.
create table if not exists public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  channel text not null check (channel in ('call', 'sms', 'email')),
  purpose text not null default 'follow_up' check (purpose in ('follow_up', 'survey', 'promo')),
  -- The concrete contacts.id batch, resolved at schedule time (so the action
  -- is deterministic). Capped at 25 to match the bulk send routes.
  contact_ids text[] not null default '{}',
  subject text,
  body text,
  scheduled_for timestamptz not null,
  -- scheduled → sending (claimed by the cron) → sent | failed; cancelled by the agent.
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Drain-cron lookup: due, not-yet-sent actions.
create index if not exists scheduled_actions_due_idx
  on public.scheduled_actions (status, scheduled_for);

-- Per-agent listing for the "scheduled & recent actions" strip.
create index if not exists scheduled_actions_agent_idx
  on public.scheduled_actions (agent_id, created_at desc);

-- Accessed only via the service-role client with explicit agent scoping (the
-- same pattern as public.contacts and /api/dashboard/leads). RLS is enabled
-- with no policies so the anon/session role is deny-all.
alter table public.scheduled_actions enable row level security;

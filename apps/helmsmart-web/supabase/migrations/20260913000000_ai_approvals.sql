-- What the AI team wants to do for a customer, waiting for the owner's yes.
--
-- Mark (the AI COO) can now hand work to the specialists from the Ask Mark
-- panel. Reads and internal writes (a task) happen at once; anything that
-- reaches a customer — a text, a payment reminder — never runs from the model.
-- It becomes one row here, `proposed`, and runs only when a member of the
-- organization approves it. The owner decides from the panel or from the
-- "Needs your approval" list on /home.
--
--   proposed  → approved → executed | failed      (the owner said yes)
--   proposed  → declined                          (the owner said no)
--   proposed  → expired                           (7 days with no decision; set on read)
--
-- `approved` is claimed with a conditional update (where status = 'proposed')
-- that returns the row, so a double click executes once.
--
-- The legacy `ai_employee_approvals` (00062) was never read or written by the
-- app and is left alone.

create table if not exists public.ai_approvals (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  employee_slug   text        not null,
  action_key      text        not null,
  params          jsonb       not null default '{}'::jsonb,
  summary         text        not null,
  details         jsonb       not null default '{}'::jsonb,
  status          text        not null default 'proposed'
                    check (status in ('proposed', 'approved', 'declined', 'executed', 'failed', 'expired')),
  source          jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid        references auth.users(id) on delete set null,
  executed_at     timestamptz,
  result          jsonb,
  error           text
);

comment on table public.ai_approvals is
  'AI-team actions that reach a customer, proposed by the Ask Mark tool loop (or an act_with_approval employee) and executed only after a member approves.';
comment on column public.ai_approvals.summary is
  'One English sentence describing the action (the floor; the UI renders details in the reader''s language).';
comment on column public.ai_approvals.details is
  'What the owner is shown before deciding: recipient, number or email, message text, invoice and amount.';

create index if not exists ai_approvals_org_status_created_idx
  on public.ai_approvals (organization_id, status, created_at desc);

alter table public.ai_approvals enable row level security;

drop policy if exists "org members can view ai approvals" on public.ai_approvals;
create policy "org members can view ai approvals" on public.ai_approvals
  for select using (organization_id in (select get_user_org_ids()));

drop policy if exists "org members can propose ai approvals" on public.ai_approvals;
create policy "org members can propose ai approvals" on public.ai_approvals
  for insert with check (organization_id in (select get_user_org_ids()));

drop policy if exists "org members can decide ai approvals" on public.ai_approvals;
create policy "org members can decide ai approvals" on public.ai_approvals
  for update using (organization_id in (select get_user_org_ids()))
  with check (organization_id in (select get_user_org_ids()));

-- A text or email the owner approved from an AI-team proposal gets its own
-- provenance, so the inbox and the activity feed can tell it from the owner's
-- own send and from an automatic reminder. Mirrors MESSAGE_SENDERS in
-- apps/helmsmart-web/lib/message-provenance.ts.

alter table public.messages
  drop constraint if exists messages_sent_by_check;

alter table public.messages
  add constraint messages_sent_by_check
  check (
    sent_by is null
    or sent_by in (
      'person',
      'auto_pilot',
      'auto_reply',
      'missed_call_text',
      'reminder',
      'receptionist',
      'ai_team'
    )
  );

comment on column public.messages.sent_by is
  'Who sent an outbound message: person, auto_pilot, auto_reply, missed_call_text, reminder, receptionist, ai_team (an AI-team action the owner approved). Null for inbound rows and for outbound rows written before 2026-09.';

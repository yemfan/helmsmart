-- Bug reports queue: product defects the realtor reports to Max, drained by a
-- scheduled Claude Code triage/fix agent (investigate -> confirm -> open a PR;
-- never auto-merge). Distinct from crm_tasks (real-estate work) and
-- hand_off_to_agent (realtor-actionable handoffs).

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  agent_id bigint references public.agents (id) on delete set null,
  title text not null,
  description text not null,
  page_context text,
  severity text not null default 'normal',
  status text not null default 'new',
  source text not null default 'ask_max',
  resolution_notes text,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint bug_reports_severity_chk check (severity in ('low', 'normal', 'high')),
  constraint bug_reports_status_chk check (status in ('new', 'triaged', 'in_progress', 'fixed', 'wontfix'))
);

comment on table public.bug_reports is
  'Product-defect tickets reported via Ask Max; drained by a scheduled Claude Code triage/fix agent (opens PRs, never auto-merges).';
comment on column public.bug_reports.status is 'new | triaged | in_progress | fixed | wontfix';
comment on column public.bug_reports.severity is 'low | normal | high';
comment on column public.bug_reports.source is 'where the report originated, e.g. ask_max';

-- The fixer polls new/triaged tickets oldest-first.
create index if not exists idx_bug_reports_status_created_at
  on public.bug_reports (status, created_at);

alter table public.bug_reports enable row level security;

-- Realtors can read their own reports (in-app "my reports" view). Writes are
-- service-role only (Max's tool + the fixer) — no client insert/update policy.
create policy bug_reports_select_own
  on public.bug_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agents a
      where a.id = bug_reports.agent_id
        and a.auth_user_id = auth.uid()
    )
  );

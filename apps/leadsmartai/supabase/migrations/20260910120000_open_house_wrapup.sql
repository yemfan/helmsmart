-- The open-house wrap-up. When an open house ends, the day is summarised
-- from the sign-in sheet (who came, how many were represented, who is
-- buying when), the host adds a comment, and the report goes to the
-- property owner and the agent who asked for the open house to be held,
-- with a copy to the host. The recipients live on the open house; the
-- summary is stored so the page shows it and the email matches it.

alter table public.open_houses
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists requesting_agent_name text,
  add column if not exists requesting_agent_email text,
  add column if not exists summary jsonb,
  add column if not exists summary_ready_at timestamptz,
  add column if not exists host_comment text,
  add column if not exists summary_sent_at timestamptz,
  add column if not exists summary_sent_to text[];

comment on column public.open_houses.summary is 'lib/open-houses/wrapup.ts WrapupSummary, built when the open house ended and rebuilt at send time.';
comment on column public.open_houses.summary_sent_to is 'Email addresses the wrap-up went to (owner, requesting agent), for the record.';

create index if not exists idx_open_houses_wrapup_due
  on public.open_houses (end_at)
  where summary_ready_at is null and status <> 'cancelled';

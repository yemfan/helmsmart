-- Track the *most recent* time an invoice was emailed (a chase/reminder).
--
-- sent_at is the FIRST send (for display); last_sent_at moves forward on every
-- resend. The Boss "Chase receivable" card uses it to stop nagging right after
-- a reminder goes out and to only nudge again once a cooldown has passed while
-- the invoice is still unpaid.
--
-- No backfill: null == "not recently reminded", so invoices currently sitting
-- overdue keep showing their chase card until the agent actually resends.

alter table public.invoices add column if not exists last_sent_at timestamptz;

comment on column public.invoices.last_sent_at is
  'Most recent time the invoice was emailed (send or resend). Drives the Boss chase-receivable cooldown. Null until sent.';

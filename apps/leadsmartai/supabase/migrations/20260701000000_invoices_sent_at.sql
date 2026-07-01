-- Record when an invoice was sent to the client.
--
-- Until now "sent" was only a status flip (status='sent' + updated_at); there
-- was no honest record of *when* it went out, so the Books list couldn't show
-- a send date/time. Add a dedicated sent_at so a resend/mark-paid later doesn't
-- clobber the original send moment.
--
-- Backfill: for invoices currently sitting in sent/overdue the last write was
-- the send itself, so updated_at is a good-enough historical value. Paid/draft
-- rows are left null (their updated_at reflects payment or edits, not a send).

alter table public.invoices add column if not exists sent_at timestamptz;

update public.invoices
   set sent_at = updated_at
 where sent_at is null
   and status in ('sent', 'overdue');

comment on column public.invoices.sent_at is
  'When the invoice was first emailed / marked sent. Null until sent.';

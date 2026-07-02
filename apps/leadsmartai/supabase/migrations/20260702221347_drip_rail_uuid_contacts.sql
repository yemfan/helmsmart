-- Drip rail (lead_sequences -> sequence_steps -> message_logs) vs uuid contacts.
--
-- The 20260480* contacts consolidation replaced bigint leads.id with uuid
-- contacts.id. The nurture rail survived the table drops, but its lead-keyed
-- columns were never migrated in-repo:
--
--   * live message_logs still has `lead_id` while ALL app code (cron
--     send-emails, twilioSms, ai-email/ai-sms, tracking + SMS webhooks)
--     writes/filters `contact_id` — every one of those writes has been
--     silently failing since the consolidation;
--   * live lead_sequences.lead_id is already `text` (changed out-of-band),
--     but the original 20260321 migration still declares bigint, so fresh
--     environments diverge from prod.
--
-- This migration codifies the live text types and finishes the
-- lead_id -> contact_id rename on message_logs. Values stay text on purpose:
-- legacy rows hold '5' / 'demo-caller-...' while new rows hold uuid
-- contacts.id as text, so a uuid cast (and an FK to contacts) is not possible
-- without destroying history.

-- 1) lead_sequences.lead_id: bigint -> text (no-op on prod, aligns fresh DBs).
alter table if exists public.lead_sequences
  alter column lead_id type text using lead_id::text;

-- 2) message_logs.lead_id -> contact_id (idempotent; skips if already renamed).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_logs'
      and column_name = 'lead_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_logs'
      and column_name = 'contact_id'
  ) then
    alter table public.message_logs rename column lead_id to contact_id;
  end if;
end $$;

-- 3) message_logs.contact_id: bigint -> text on fresh DBs (no-op on prod).
alter table if exists public.message_logs
  alter column contact_id type text using contact_id::text;

-- 4) Keep the index name honest post-rename.
alter index if exists idx_message_logs_lead_id_created_at
  rename to idx_message_logs_contact_id_created_at;

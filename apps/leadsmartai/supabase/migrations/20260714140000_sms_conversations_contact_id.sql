-- AI SMS responder conversation storage — current (contacts-keyed) schema.
--
-- The original 20260323_ai_sms_responder.sql created sms_conversations keyed by
-- lead_id -> leads(id). After the leads -> contacts rename, every consumer
-- (app/api/sms/webhook, dashboard sms-conversation, sms/debug) switched to
-- `contact_id uuid`, but no migration ever created the contacts-keyed table on
-- prod. Result: /api/sms/webhook throws on the sms_conversations read BEFORE it
-- can reply, so inbound texts never get an AI response. This creates the table
-- with the schema the code actually expects. Idempotent + drift-safe.

create table if not exists public.sms_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  stage text not null default 'new' check (lower(stage) in ('new', 'warm', 'hot')),
  last_ai_reply_at timestamptz,
  created_at timestamptz not null default now()
);

-- The webhook upserts one conversation per contact (select-by/insert/update on
-- contact_id), so enforce a single row per contact.
create unique index if not exists idx_sms_conversations_contact_id_unique
  on public.sms_conversations (contact_id);

create index if not exists idx_sms_conversations_last_ai_reply_at
  on public.sms_conversations (last_ai_reply_at desc);

-- Shared-DB RLS posture (#621): RLS enabled, no policies — access only via the
-- service-role client (supabaseServer). Never touched by the session client.
alter table public.sms_conversations enable row level security;

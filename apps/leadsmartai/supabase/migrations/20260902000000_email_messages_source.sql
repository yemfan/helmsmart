-- Which app sent this message?
--
-- `contacts` is shared: CloseBoss (apps/leadsmartai) and PropertyTools AI
-- (apps/propertytoolsai) both email the same people from the same verified
-- domain, and both write to this database. Until now nothing recorded which
-- was which, so "why is my contact getting these emails" had no answer in the
-- data — it took tracing cron schedules against timestamps to find that the
-- 6-hourly volume came from PropertyTools, not CloseBoss.
--
-- WHY A COLUMN AND NOT A TABLE PER APP. The Inbox threads BY CONTACT, and the
-- contact is shared: if PropertyTools emails someone in the morning and
-- CloseBoss in the afternoon, that is one conversation with one person, not two
-- half-threads. Splitting by sender would also repeat the exact defect this
-- codebase already carries — `message_logs` and `email_messages` are two tables
-- holding the same kind of thing, the Inbox read one while the senders wrote
-- the other, and 168 messages were invisible for two months with no error. A
-- third table per app makes that failure mode routine.
--
-- Suppression is the clincher: an unsubscribe means "stop emailing me", not
-- "stop from this app", so the check has to see every message together.

alter table if exists public.email_messages
  add column if not exists source text;

comment on column public.email_messages.source is
  'Which app sent this: closeboss | propertytoolsai. NULL on rows written before the column existed. Filter and label with it — do NOT split threads by it; the contact is shared and the conversation is one.';

-- Attribute the rows recovered from `message_logs` on 2026-09-02. They carry a
-- provenance marker, and every one of them came from PropertyTools AI's
-- smart-automation cron, which is the only sender writing `message_logs`
-- without also threading the message.
update public.email_messages
   set source = 'propertytoolsai'
 where source is null
   and external_message_id like 'backfill:message_logs:%';

create index if not exists idx_email_messages_source
  on public.email_messages (source);

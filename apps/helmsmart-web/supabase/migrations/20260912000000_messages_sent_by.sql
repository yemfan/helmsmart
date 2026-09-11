-- Who (or what) sent an outbound message.
--
-- Until now nothing could tell a person's reply from Auto Pilot's, from an
-- automatic reminder, or from the missed-call text: every outbound row looked
-- the same, so the inbox signed all of them "You:". The app now writes this on
-- every outbound insert; the value set mirrors MESSAGE_SENDERS in
-- apps/helmsmart-web/lib/message-provenance.ts.
--
-- Nullable on purpose: inbound rows have no sender of ours, and outbound rows
-- written before this column existed are genuinely unknown.

alter table public.messages
  add column if not exists sent_by text;

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
      'receptionist'
    )
  );

comment on column public.messages.sent_by is
  'Who sent an outbound message: person, auto_pilot, auto_reply, missed_call_text, reminder, receptionist. Null for inbound rows and for outbound rows written before 2026-09.';

-- The two older rows whose origin is certain from an exact marker. Everything
-- else written before this migration stays null (unknown) rather than guessed.
update public.messages
   set sent_by = 'reminder'
 where direction = 'outbound' and sent_by is null and intent = 'sms_reminder';

update public.messages
   set sent_by = 'auto_reply'
 where direction = 'outbound' and sent_by is null and intent = 'cancel_confirm';

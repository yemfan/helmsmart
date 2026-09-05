-- A capability token so a caller can reschedule online instead of phoning back.
--
-- CloseBoss's booking confirmation says "Call us back if you need to change it"
-- / "如需改期请回电" — the only way to move an appointment was to ring the
-- receptionist again during business hours. HelmSmart has had a self-serve
-- reschedule page since it shipped; this gives voice_appointments the same
-- token so CloseBoss can have one too.
--
-- The token IS the authorization: whoever holds the link can move that one
-- appointment and nothing else. So it is a random uuid, never a guessable id,
-- and it is unique so a link can only ever resolve to one appointment.
--
-- gen_random_uuid() is volatile, so Postgres evaluates it per row when the
-- column is added — every existing appointment gets its own token rather than
-- all of them sharing one.
alter table public.voice_appointments
  add column if not exists reschedule_token uuid not null default gen_random_uuid();

create unique index if not exists voice_appointments_reschedule_token_key
  on public.voice_appointments(reschedule_token);

comment on column public.voice_appointments.reschedule_token is
  'Capability token for the public /reschedule/[token] page. Holder may move this appointment.';

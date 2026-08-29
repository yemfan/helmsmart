-- voice_appointments: record WHAT the appointment is for and HOW it happens.
--
-- Until now the only trace of either was inside `title`, a free-text string
-- built as "<whatever the agent said> — <caller name>". So nothing could count
-- how many valuations were booked this month, or filter the calendar to
-- showings, or notice that a caller kept asking for video and always got an
-- in-person slot. The information was spoken, agreed, and then thrown away.
--
-- Two columns rather than one, because they are two different facts:
--
--   appointment_type  the PURPOSE  — buyer_consultation, showing, home_valuation,
--                     seller_consultation, general_meeting
--   meeting_mode      the MEDIUM   — in_person, phone, video
--
-- A buyer consultation can be a video meeting; a property showing cannot be
-- anything but in person. Collapsing the two into a single list is what makes
-- a booking flow ask "consultation or video call?", which is not a question.
--
-- Both nullable: every row that already exists predates them, and an
-- unrecognised label is better left blank than guessed at. The catalogue lives
-- in packages/voice/src/appointmentTypes.ts, which is also what maps whatever
-- the agent said back onto these values.
--
-- No CHECK constraint on purpose. The catalogue will grow, and a constraint
-- here would mean a migration every time someone adds a type — with the
-- failure landing as a 400 mid-call, which is the worst place to discover it.

alter table if exists public.voice_appointments
  add column if not exists appointment_type text null;

alter table if exists public.voice_appointments
  add column if not exists meeting_mode text null;

comment on column public.voice_appointments.appointment_type is
  'Purpose: buyer_consultation | showing | seller_consultation | home_valuation | general_meeting. Null when the agent said something we could not map.';

comment on column public.voice_appointments.meeting_mode is
  'Medium: in_person | phone | video. Null on rows booked before this existed.';

-- The calendar filters by agent and date; adding type to that ordering keeps
-- "show me this month's valuations" cheap.
create index if not exists idx_voice_appointments_agent_type_start
  on public.voice_appointments (agent_id, appointment_type, start_at desc);

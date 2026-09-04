-- Where to text the business when the receptionist books an appointment.
--
-- There was nowhere to put this. `organizations` carries `twilio_number` — the
-- line the receptionist ANSWERS on — and no contact number for the owner, and
-- `organization_members` has a role but no phone. So when the AI booked someone,
-- the only notice was an in-app row on /calendar: an owner away from the screen
-- learned about an 11am appointment by arriving at 11am.
--
-- Nullable and blank by default. Empty means "don't text me", which needs no
-- toggle beside it to explain itself.
alter table public.organizations
  add column if not exists booking_alert_phone text;

comment on column public.organizations.booking_alert_phone is
  'E.164 number texted when the AI receptionist books an appointment. Null/blank disables it.';

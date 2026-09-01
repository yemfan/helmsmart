-- A per-contact unsubscribe token, so agent outreach email can carry a working
-- opt-out link.
--
-- The drip rail (`app/api/cron/send-emails`) sends automated marketing to
-- contacts with an open-tracking pixel in the body, and until now with no
-- unsubscribe link, no List-Unsubscribe header, and no opt-out check at all.
-- The SMS branch of the very same loop refuses to send without `sms_opt_in`;
-- the email branch simply sent. CAN-SPAM requires a working opt-out mechanism
-- on commercial email, and reputation damage lands on `realtybossai.com` —
-- the only verified sending domain, shared by every app here.
--
-- WHY A TOKEN AND NOT THE CONTACT ID. The unsubscribe URL travels in the clear
-- through mail servers, gateways and anyone the recipient forwards to. A
-- sequential or guessable identifier would let a stranger unsubscribe someone
-- else, or walk the range to enumerate who is in the CRM. A random uuid is
-- unguessable and reveals nothing about the row it points at.
--
-- Existing rows are filled by the DEFAULT — Postgres 11+ applies it without a
-- table rewrite — so every contact has a token immediately and no backfill
-- pass is needed.
--
-- The opt-out itself has somewhere to go already: `contacts` carries BOTH
-- `contact_opt_out_email` (the contact asked us to stop) and
-- `do_not_contact_email` (the agent marked them do-not-contact). Those are
-- different actors and both are respected on send; an unsubscribe writes the
-- FORMER, because it is the contact speaking.

alter table if exists public.contacts
  add column if not exists email_unsubscribe_token uuid not null default gen_random_uuid();

-- Unique so a token identifies exactly one contact, and indexed because the
-- unsubscribe endpoint's only query is a lookup by it.
create unique index if not exists uq_contacts_email_unsubscribe_token
  on public.contacts (email_unsubscribe_token);

comment on column public.contacts.email_unsubscribe_token is
  'Random per-contact token for the one-click email unsubscribe URL (RFC 8058) and the footer link. Never derived from the contact id — the URL travels in the clear. Resolves to contact_opt_out_email = true.';

comment on column public.contacts.contact_opt_out_email is
  'The CONTACT asked to stop receiving email (unsubscribe link, reply, or request). Distinct from do_not_contact_email, which is the AGENT''s own suppression flag. Both are checked before sending.';

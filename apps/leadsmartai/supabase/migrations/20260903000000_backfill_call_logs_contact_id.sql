-- Attach past calls to the contacts they belong to.
--
-- A call is matched to a contact once, at call start — and a first-time caller
-- is not a contact yet, so contact_id is null and correctly so. The receptionist
-- then CREATES that contact from the call, and nothing went back to stamp the
-- call row. The call that produced the contact was the one call not attached to
-- it, and the Calls list showed "Unknown caller" for people the CRM held a full
-- record of.
--
-- The code fix is in lib/voice-agent/lead-capture.ts (link as soon as a contact
-- is resolved or created) and lib/missed-call/service.ts
-- (finalizeCallByProviderId re-matches as a safety net). This repairs the rows
-- written before that fix.
--
-- SAFETY
--   * Only fills contact_id where it IS NULL. Never re-points a call that is
--     already attached, so a name-disambiguated match cannot be overwritten by
--     a phone-only one.
--   * Requires the number to resolve to EXACTLY ONE contact for that agent.
--     findContactByPhone uses the name the caller spoke to break ties and SQL
--     has no such hint, so an ambiguous number is left alone rather than
--     guessed at. One number can legitimately sit on several contacts — a
--     household sharing a line, a duplicate import.
--   * Matches on the last 10 digits, because the two sides store different
--     formats: call_logs.from_phone is E.164 ("+16266255055") and
--     contacts.phone is display ("(626) 625-5055").
--   * Idempotent: re-running links nothing new.

update call_logs cl
set contact_id = m.contact_id
from (
  select cl2.id as call_id, min(c.id::text)::uuid as contact_id
  from call_logs cl2
  join contacts c
    on c.agent_id = cl2.agent_id
   and length(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')) >= 10
   and right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10)
     = right(regexp_replace(cl2.from_phone, '[^0-9]', '', 'g'), 10)
  where cl2.contact_id is null
    and cl2.from_phone is not null
    and length(regexp_replace(cl2.from_phone, '[^0-9]', '', 'g')) >= 10
  group by cl2.id
  having count(distinct c.id) = 1
) m
where cl.id = m.call_id
  and cl.contact_id is null;

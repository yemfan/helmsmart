-- contacts: one phone number, one contact, per agent.
--
-- Email already works this way — `uq_contacts_agent_email` on
-- (agent_id, lower(email)) where email is not null. Phone had no equivalent,
-- and the cost of that showed up all day: a number resolving to several rows
-- means the receptionist and the SMS webhook pick a record by ordering rather
-- than by identity, and the same caller can reach a different history depending
-- on which row was touched last.
--
-- Matched on the last ten digits rather than the stored string, because the
-- same number is written several ways — "(626) 555-0166" from the contact form,
-- "+16265550166" from an import. Comparing the formatting would let both exist
-- side by side, which is precisely the duplicate this is meant to prevent.
--
-- Scoped per agent, like the email index: two agents legitimately having the
-- same person in their own book is not a duplicate, and a global index would
-- refuse the second one.
--
-- Verified before writing this: of the four numbers currently shared by more
-- than one contact, all four are shared ACROSS agents (22/26, 30/26, 30/26,
-- 29/22). Within any single agent there are zero duplicates, so this index
-- builds against today's data with nothing to merge first.

create unique index if not exists uq_contacts_agent_phone
  on public.contacts (
    agent_id,
    right(regexp_replace(phone, '\D', '', 'g'), 10)
  )
  where phone is not null
    and length(regexp_replace(phone, '\D', '', 'g')) >= 10;

-- Stop voice_receptionist_settings.timezone contradicting the account setting.
--
-- There is ONE timezone per account and it lives in agents.briefing_timezone.
-- This column is a leftover from when there were two, three hours apart:
--
--     agents.briefing_timezone              → America/Los_Angeles
--     voice_receptionist_settings.timezone  → America/New_York
--
-- Briefings fired on one and the receptionist booked on the other, so an agent
-- who never opened the receptionist panel had the AI booking 9am appointments
-- that landed at noon for the caller. That was fixed in code (see
-- lib/agent/timezone.ts): getReceptionistConfig now reads the account timezone
-- and mapRow drops this column, and saveReceptionistConfig refuses to write it
-- — "Not settable here. One timezone per account, changed in one place."
--
-- The stored value was never cleaned up, so the row still asserts the OLD
-- default. That is not harmless: anyone reading the database to answer "what
-- timezone is this receptionist on" gets the wrong answer confidently. It cost
-- exactly that on 2026-09-05 — the row said New York while the agent's
-- appointments were plainly Pacific, and the contradiction had to be chased
-- through three files to establish which one was lying.
--
-- Nothing reads or writes the column, so this is a one-time alignment: it
-- cannot drift again unless someone starts writing it.
update public.voice_receptionist_settings s
set timezone = a.briefing_timezone
from public.agents a
where a.id = s.agent_id
  and coalesce(a.briefing_timezone, '') <> ''
  and s.timezone is distinct from a.briefing_timezone;

comment on column public.voice_receptionist_settings.timezone is
  'DEPRECATED — not read and not written. The account timezone is agents.briefing_timezone; see lib/agent/timezone.ts. Kept aligned so the row cannot contradict it.';

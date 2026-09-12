-- Calendar events: repair the rows that were stored as a wall clock.
--
-- `events.start_at` / `end_at` are `timestamptz` — instants. The booking flow
-- always wrote instants, but the calendar UI sent the time the owner typed
-- with no offset ("2026-06-09T10:00:00"), and Postgres read that as UTC. Those
-- rows are therefore off by the organization's UTC offset: a 10:00 meeting is
-- stored as 10:00Z, which is 03:00 in Los Angeles.
--
-- The write path is fixed in `lib/actions/events.ts` (the wall clock is
-- converted in the org's timezone before the insert), so no new row can land
-- in the old shape. This migration corrects the rows that already did.
--
-- HOW THE ROWS WERE IDENTIFIED. They are listed by id rather than matched by a
-- predicate, because no column records which code wrote a row: the only signal
-- is the time itself, and "implausible local time" is not something to hand a
-- WHERE clause on a table that will grow. At the time of writing the table held
-- 15 rows in one organization (America/Los_Angeles):
--   * 9 rows at 09:00–13:00 local — the booking flow's instants, already right.
--   * the 6 below, all created in the same minute on 2026-06-03 (a seeded demo
--     batch), sitting at 01:00 and 03:00 local, i.e. 08:00Z and 10:00Z: the
--     typed times 08:00 and 10:00.
-- Every one of them is in the past, so nothing upcoming moves.
--
-- The conversion reads the stored clock as the organization's wall time and
-- turns it into the instant it should always have been:
--   (start_at at time zone 'UTC')            -> the wall clock that was typed
--   ... at time zone organizations.timezone  -> that wall clock, as an instant

update events e
set    start_at = (e.start_at at time zone 'UTC') at time zone o.timezone,
       end_at   = case
                    when e.end_at is null then null
                    else (e.end_at at time zone 'UTC') at time zone o.timezone
                  end,
       updated_at = now()
from   organizations o
where  o.id = e.organization_id
and    e.id in (
         '4efc6520-4758-4133-a2c7-50d521ab11c6',  -- meeting,     2026-06-09 10:00 typed
         '7f5bf325-e1ab-42af-ac79-7955adadb35a',  -- meeting,     2026-06-07 10:00 typed
         '9d26b460-5f5c-4ddf-82f6-d626e402169c',  -- meeting,     2026-06-04 10:00 typed
         '4a4133dd-c3f6-4985-b953-ec9555f94ae6',  -- meeting,     2026-06-05 10:00 typed
         '6f4e385d-75e9-44ad-a38d-0ff8f036a49c',  -- appointment, 2026-06-06 10:00 typed
         'e1196d2e-6f9a-41ec-9715-5a264173a263'   -- task,        2026-06-08 08:00 typed
       );

-- After this runs, every row in `events` should read back on the business's
-- clock as a plausible working time:
--   select to_char(e.start_at at time zone o.timezone, 'YYYY-MM-DD HH24:MI')
--   from events e join organizations o on o.id = e.organization_id
--   order by e.start_at;

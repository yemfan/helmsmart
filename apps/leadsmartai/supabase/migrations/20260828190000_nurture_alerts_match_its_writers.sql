-- nurture_alerts: make the table match the code that writes to it.
--
-- The table has never held a single row. Not "few" — zero, since it was
-- created. Every one of the twelve insert sites has failed, and every one of
-- them is wrapped in `catch {}`, so nothing ever said so. The two readers
-- (lib/mobile/inbox.ts and lib/mobile/mobileDashboard.ts) have been rendering
-- an empty list and calling it "no alerts".
--
-- Two independent reasons every insert failed:
--
--   1. `lead_id text NOT NULL` with no default. This is residue from the
--      leads -> contacts migration, which added `contact_id` and left the old
--      column behind still marked NOT NULL. Not one writer supplies lead_id and
--      not one reader selects it — all twelve writers pass `contact_id`, and
--      both readers filter on it. The column is dead weight that rejects every
--      row on the way in.
--
--   2. `agent_id uuid`, while an agent id is a bigint everywhere else in this
--      schema. The writers pass `String(leadRow.agent_id)` — "26" — which
--      Postgres rejects as invalid input syntax for uuid. So even with lead_id
--      supplied, the insert would still have failed.
--
-- Dropping and retyping is safe precisely because the table is empty: there is
-- no data to lose and no value to preserve through the type change. That is the
-- one silver lining of a bug this total.

-- 1. Dead column. Its index goes with it.
alter table public.nurture_alerts drop column if exists lead_id;

-- 2. An agent id is a bigint. `using null::bigint` would be destructive on a
--    populated table; here there are no rows for it to touch.
alter table public.nurture_alerts
  alter column agent_id type bigint using null::bigint;

-- 3. Every writer supplies contact_id and both readers filter on it, so a row
--    without one is unreachable by definition. The foreign key to contacts
--    (on delete cascade) already exists.
alter table public.nurture_alerts
  alter column contact_id set not null;

-- agent_id stays nullable on purpose. The writers already guard with
-- `if (agentId)`, and a NOT NULL here would turn a missing agent into another
-- silently swallowed insert — the exact failure being fixed.

-- Join a visitor's anonymous history to the contact they become.
--
-- #1433 gave traffic_events visitor_id and session_id. This adds the other
-- half: the contact those events turn out to belong to, so the agent can be
-- told "this lead read three of your posts and your valuation page before
-- calling you" — which is the single most persuasive thing a marketing hub
-- can show them.
--
-- WHY NOT `lead_id`. The table already has one, and it cannot serve: it is a
-- BIGINT left over from the retired `leads` table, while contacts.id is a
-- UUID. Zero rows have ever used it. It is left in place rather than dropped
-- because propertytoolsai's smoke script still selects it, and a column with
-- no rows costs nothing; dropping it belongs to a cleanup of its own.
--
-- The stitch runs at conversion: when a visitor submits the hub form, every
-- prior event carrying their visitor_id gets the new contact id. Nothing is
-- retroactive beyond that — history that was never recorded cannot be
-- recovered, which is the reason to get the capture right before the traffic
-- rather than after it.
--
-- Scoped by agent as well as visitor when stitching. One browser can visit
-- two agents' hubs, and those are two separate relationships; the same
-- visitor_id must not drag one agent's page views into another agent's CRM.

alter table if exists public.traffic_events
  add column if not exists contact_id uuid null references public.contacts(id) on delete set null;

comment on column public.traffic_events.contact_id is
  'The contact this event turned out to belong to, filled in at conversion for every prior event from the same visitor_id and agent. NULL while the visitor is still anonymous — which is most events, most of the time.';

-- "Everything this visitor did for this agent", the query the stitch runs and
-- the journey view reads.
create index if not exists idx_traffic_events_agent_visitor
  on public.traffic_events (agent_id, visitor_id, created_at desc)
  where visitor_id is not null;

-- "Everything this contact did before and since", the query the agent sees.
create index if not exists idx_traffic_events_contact
  on public.traffic_events (contact_id, created_at desc)
  where contact_id is not null;

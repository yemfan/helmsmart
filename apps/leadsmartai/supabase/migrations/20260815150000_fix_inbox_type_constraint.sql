-- Drop the DUPLICATE notification-type CHECK that silently blocked avatar_ready.
--
-- The earlier migration (20260815120000_avatar_render_jobs.sql) did:
--
--   DROP CONSTRAINT IF EXISTS agent_inbox_notifications_type_check;
--   ADD  CONSTRAINT agent_inbox_notifications_type_check CHECK (... 'avatar_ready');
--
-- but the constraint that actually existed was named
-- `agent_inbox_notifications_type_chk` — "chk", not "check". So the DROP
-- matched nothing, succeeded silently (that is what IF EXISTS does), and we
-- ADDED a permissive constraint ALONGSIDE the restrictive original.
--
-- Postgres requires EVERY check constraint to pass. 'avatar_ready' satisfied
-- the new one and failed the old one, so every "your avatar video is ready"
-- notification was rejected. Because notifications are written best-effort and
-- the insert error was caught, renders completed silently and the agent was
-- never told — the exact feature the job system was built to provide.
--
-- Verifying the new constraint existed was not enough; the check that would
-- have caught this is whether an insert actually succeeds. That is what the
-- test below the DDL does.

ALTER TABLE public.agent_inbox_notifications
  DROP CONSTRAINT IF EXISTS agent_inbox_notifications_type_chk;

-- Prove the type is now insertable rather than trusting the constraint list:
-- fails loudly here if some third constraint still rejects it.
DO $$
DECLARE probe_id uuid;
BEGIN
  INSERT INTO public.agent_inbox_notifications (agent_id, type, priority, title, body, read)
  SELECT id, 'avatar_ready', 'low', 'migration probe', 'removed immediately', true
    FROM public.agents ORDER BY id LIMIT 1
  RETURNING id INTO probe_id;

  DELETE FROM public.agent_inbox_notifications WHERE id = probe_id;
END $$;

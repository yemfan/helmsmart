-- Avatar renders as durable background jobs.
--
-- WHY: the render used to run inline in POST /api/dashboard/avatar. fal's
-- Fabric/lipsync pass plus the optional upscale can exceed Vercel's 300s
-- function wall, and a Vercel timeout SIGKILLs the function — which is not an
-- exception, so the credit refund never ran and the agent paid for nothing.
--
-- Moving the work to a cron does NOT fix that on its own: a cron handler is
-- also a 300s function. What fixes it is never WAITING inside any single
-- invocation — one tick submits to fal and records the request id, later ticks
-- poll it. A render may then take as long as fal needs.
--
-- The row is also what makes "notify me when it's done" possible: completion is
-- owned by the server, so closing the tab no longer orphans the render.

CREATE TABLE IF NOT EXISTS public.avatar_render_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     bigint NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  -- Credits are reserved against the USER, not the agent — mirrors
  -- withCreditsMetered so a refund can find its way back.
  user_id      uuid NOT NULL,

  -- Everything needed to run the render without re-reading the UI's state.
  script       text NOT NULL,
  voice        text,
  audio_path   text,
  sharpen      boolean NOT NULL DEFAULT false,
  photo_avatar boolean NOT NULL DEFAULT false,

  -- queued      → nothing submitted yet
  -- rendering   → base clip (Fabric or lipsync) in flight at fal
  -- upscaling   → optional Sharper pass in flight
  -- done/failed → terminal
  status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','rendering','upscaling','done','failed')),

  -- The in-flight fal request. Storing the URLs verbatim (rather than rebuilding
  -- them) keeps us working if fal changes its queue URL shape.
  fal_request_id  text,
  fal_status_url  text,
  fal_response_url text,
  -- The clip produced by the base pass, kept while the upscale runs so a failed
  -- upscale can still fall back to a real video instead of losing the render.
  base_video_url  text,

  video_url    text,
  error        text,
  -- Credits reserved up front; recorded so a refund is exact and auditable.
  credits      integer NOT NULL DEFAULT 0,
  attempts     integer NOT NULL DEFAULT 0,

  -- Set when the agent has been told. Separate from status so a notification
  -- failure never marks a finished render as unfinished.
  notified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The drain scans for unfinished work; the UI reads the agent's latest job.
CREATE INDEX IF NOT EXISTS avatar_render_jobs_active_idx
  ON public.avatar_render_jobs (status, updated_at)
  WHERE status IN ('queued','rendering','upscaling');

CREATE INDEX IF NOT EXISTS avatar_render_jobs_agent_idx
  ON public.avatar_render_jobs (agent_id, created_at DESC);

-- Service-role only: every write goes through the route or the cron, both of
-- which use the admin client. RLS on with no policy = no session-client access.
ALTER TABLE public.avatar_render_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.avatar_render_jobs IS
  'Background avatar renders. Submission and polling happen in separate cron ticks so no single serverless invocation waits on fal.';

-- The finished-render notification needs its own type. Widening the CHECK is
-- required: an unlisted value fails the insert, and the notification is
-- best-effort, so it would fail silently and the agent would never be told.
ALTER TABLE public.agent_inbox_notifications
  DROP CONSTRAINT IF EXISTS agent_inbox_notifications_type_check;

ALTER TABLE public.agent_inbox_notifications
  ADD CONSTRAINT agent_inbox_notifications_type_check
  CHECK (type IN ('hot_lead','missed_call','reminder','new_lead','avatar_ready'));

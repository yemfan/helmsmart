-- Video reels (Remotion Lambda → MP4 → IG Reels / FB video / LinkedIn video).
-- A reel is rendered asynchronously (render_id/bucket), then its public mp4_url
-- is posted. Service-role only (RLS on, no policies), same as social_carousels.

create table if not exists public.social_reels (
  id            uuid primary key default gen_random_uuid(),
  agent_id      bigint,
  slides        jsonb not null default '[]',   -- [{ heading, body }]
  caption       text,
  hashtags      text[] not null default '{}',
  -- render state (Remotion Lambda)
  render_id     text,
  render_bucket text,
  mp4_url       text,                            -- public MP4 once the render finishes
  render_error  text,
  -- lifecycle
  status        text not null default 'draft'
                check (status in ('draft','rendering','rendered','scheduled','posted','failed','dismissed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.social_reels is
  'Video reels: slides -> Remotion Lambda MP4 -> reel/video posts. Service-role only. Rendered async (render_id/bucket -> mp4_url).';

create index if not exists social_reels_agent_status_idx
  on public.social_reels (agent_id, status, created_at desc);
-- Drives the render-poll step: reels currently rendering.
create index if not exists social_reels_rendering_idx
  on public.social_reels (status) where status = 'rendering';

alter table public.social_reels enable row level security;

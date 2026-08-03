-- Agent digital twin — Phase C (talking avatar).
-- Persist the last generated avatar script + rendered video so the studio
-- survives a reload. The video is a public social-images URL (shareable/postable);
-- the source intro video + cloned voice stay private per Phases A/B.
alter table public.agents
  add column if not exists dt_avatar_script text,
  add column if not exists dt_avatar_video_url text;

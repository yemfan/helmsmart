-- Photo-based digital twin: let an agent supply a still portrait instead of an
-- intro video for the lifelike ("photo") avatar. The voice clone is already a
-- separate rail (agent voice settings), so the intro video was only still
-- required to harvest a portrait frame — which blocked camera-shy agents from
-- the feature entirely.
--
-- Private path in the same `lead-media`/digital-twin/{agent} space as the intro
-- video; it is the agent's likeness and is only ever read via a short-lived
-- signed URL, under the same dt_consent gate.
alter table public.agents
  add column if not exists dt_portrait_path text;

comment on column public.agents.dt_portrait_path is
  'Private storage path of the agent''s uploaded portrait photo (lead-media/digital-twin/{agent_id}/...). Alternative likeness source to dt_intro_video_path for photo avatars. Governed by dt_consent.';

-- Onboarding profile captured by the Max welcome conversation.
--
-- Canonical fields already have homes (name -> user_profiles.full_name,
-- brokerage -> agents.brokerage) and completion reuses the existing
-- agents.onboarding_completed flag. This adds a small jsonb bag for the
-- softer signals the conversation collects (market, buyers/sellers focus,
-- the agent's #1 goal) so Max can weight his suggestions toward them.
alter table public.agents
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

comment on column public.agents.onboarding is
  'Onboarding answers from the Max welcome flow: { name, market, focus, goal, brokerage, completed_at }.';

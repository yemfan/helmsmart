-- Pooled credits: when a team owner turns this on, every member's paid
-- actions (AI minutes, video, images) spend from the owner's credit balance
-- instead of their own, and the members see the team balance. Top-ups and
-- monthly grants keep landing on whoever bought them. Off by default.

alter table public.teams
  add column if not exists pooled_credits boolean not null default false;

comment on column public.teams.pooled_credits is 'Members spend credits from the owner''s balance. lib/credits/pool.server.ts resolves the paying account.';

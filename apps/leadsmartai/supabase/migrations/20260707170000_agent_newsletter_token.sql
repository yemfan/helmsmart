-- Phase 3: agent-branded weekly newsletter.
-- Each agent gets a stable, opaque public token used in their shareable
-- client-newsletter signup link (/newsletter/a/[token]). Existing agents are
-- auto-filled by the column DEFAULT, so no backfill is required.

alter table public.agents
  add column if not exists newsletter_token uuid not null default gen_random_uuid();

create unique index if not exists agents_newsletter_token_idx
  on public.agents(newsletter_token);

comment on column public.agents.newsletter_token is
  'Public opaque id for the agent''s shareable client-newsletter signup link (/newsletter/a/[token]). Auto-filled for existing rows via the default.';

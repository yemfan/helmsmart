-- Social Post Recommendations — the PER-AGENT weekly social queue.
--
-- Phase 1 of "Social Content Database + weekly Marketing Assistant
-- recommendations". Each week, lib/social/recommend.ts builds a small mix of
-- post drafts for an agent (1 TIMELY from the newsletter digest + 2 EVERGREEN
-- from social_content_library). Depending on the agent's autopilot mode for
-- (marketing_assistant, social) in boss_autopilot_settings, rows land as
-- 'suggested' (approval mode) or 'approved' (autopilot). The agent copies/shares
-- the draft to their own socials — there is NO real platform posting in v1.
--
-- Ownership: agent-scoped RLS (select/insert/update/delete own via the
-- agents.auth_user_id = auth.uid() join), copied from cma_reports/market_reports.
-- The weekly cron writes cross-agent through the service-role client, which
-- bypasses RLS — so cron writes work AND a dashboard user only ever sees/mutates
-- their own rows.
--
-- agent_id type follows public.agents.id (uuid OR bigint) via the same runtime
-- branch as cma_reports/market_reports (bigint on this schema).

do $$
declare
  v_agent_type text;
begin
  select a.atttypid::regtype::text
    into v_agent_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'agents'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if v_agent_type is null then
    raise exception 'public.agents.id column not found';
  end if;

  if v_agent_type = 'uuid' then
    execute $sql$
      create table if not exists public.social_post_recommendations (
        id uuid primary key default gen_random_uuid(),
        agent_id uuid not null references public.agents(id) on delete cascade,
        week_of date not null,
        source_type text not null check (source_type in ('evergreen', 'timely')),
        library_id uuid references public.social_content_library(id) on delete set null,
        timely_ref text,
        caption text not null,
        hashtags text[] not null default '{}',
        link text,
        image_prompt text,
        status text not null default 'suggested'
          check (status in ('suggested', 'approved', 'dismissed', 'copied')),
        created_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.social_post_recommendations (
        id uuid primary key default gen_random_uuid(),
        agent_id bigint not null references public.agents(id) on delete cascade,
        week_of date not null,
        source_type text not null check (source_type in ('evergreen', 'timely')),
        library_id uuid references public.social_content_library(id) on delete set null,
        timely_ref text,
        caption text not null,
        hashtags text[] not null default '{}',
        link text,
        image_prompt text,
        status text not null default 'suggested'
          check (status in ('suggested', 'approved', 'dismissed', 'copied')),
        created_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for social_post_recommendations: %', v_agent_type;
  end if;
end $$;

comment on table public.social_post_recommendations is
  'Per-agent weekly social-post draft queue. One row per recommended post. source_type timely = composed from the newsletter digest (link to the issue); evergreen = drawn from social_content_library. status suggested (approval mode) / approved (autopilot) / dismissed / copied.';

comment on column public.social_post_recommendations.timely_ref is
  'For timely posts, the newsletter digest week_of the caption was composed from.';
comment on column public.social_post_recommendations.link is
  'The public link the agent shares with the post (e.g. the newsletter issue for a timely post).';

create index if not exists idx_social_post_recs_agent_week
  on public.social_post_recommendations (agent_id, week_of desc);

create index if not exists idx_social_post_recs_agent_status
  on public.social_post_recommendations (agent_id, status);

-- ── RLS ──────────────────────────────────────────────────────────
-- Agent-scoped, copied from cma_reports/market_reports: an agent can
-- select/insert/update/delete only their own rows via the
-- agents.auth_user_id = auth.uid() join. The weekly cron writes through the
-- service-role client, which bypasses RLS entirely.

alter table public.social_post_recommendations enable row level security;

drop policy if exists "social_post_recs_select_own" on public.social_post_recommendations;
create policy "social_post_recs_select_own"
  on public.social_post_recommendations
  for select
  using (
    exists (
      select 1 from public.agents
      where agents.id = social_post_recommendations.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "social_post_recs_insert_own" on public.social_post_recommendations;
create policy "social_post_recs_insert_own"
  on public.social_post_recommendations
  for insert
  with check (
    exists (
      select 1 from public.agents
      where agents.id = social_post_recommendations.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "social_post_recs_update_own" on public.social_post_recommendations;
create policy "social_post_recs_update_own"
  on public.social_post_recommendations
  for update
  using (
    exists (
      select 1 from public.agents
      where agents.id = social_post_recommendations.agent_id
        and agents.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agents
      where agents.id = social_post_recommendations.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "social_post_recs_delete_own" on public.social_post_recommendations;
create policy "social_post_recs_delete_own"
  on public.social_post_recommendations
  for delete
  using (
    exists (
      select 1 from public.agents
      where agents.id = social_post_recommendations.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

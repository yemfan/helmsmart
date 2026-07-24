-- Social autopilot for HelmSmart.
--
-- One row per org holding the auto-post controller settings. Emily generates
-- posts ABOUT the business on this cadence and schedules them into social_posts;
-- the existing */15 publish cron sends the ones due. Mirrors the
-- org_oauth_tokens one-row-per-org + RLS + set_updated_at() pattern.

create table if not exists org_social_autopilot (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references organizations(id) on delete cascade,

  -- Master switch. Off (default) = today's behaviour: nothing is generated.
  enabled           boolean     not null default false,

  -- Who signs off before a generated post publishes.
  --   'review' — generated posts land as drafts; a human schedules/publishes.
  --   'auto'   — generated posts are scheduled and publish with no gate.
  mode              text        not null default 'review'
                                check (mode in ('review', 'auto')),

  posts_per_week    smallint    not null default 3
                                check (posts_per_week between 1 and 7),
  -- Max posts on a single day. NULL = one per day.
  posts_per_day     smallint    check (posts_per_day is null or posts_per_day between 1 and 5),

  -- Target platforms. NULL = every connected publishable account. Instagram is
  -- deliberately excluded from autopilot (text-only posts can't satisfy IG's
  -- image requirement) even if listed.
  platforms         text[]      check (
                                  platforms is null
                                  or platforms <@ array['facebook','instagram','linkedin','threads']::text[]
                                ),

  -- Allowed weekdays 0=Sun..6=Sat. NULL = spread across the week.
  post_days         smallint[]  check (
                                  post_days is null
                                  or post_days <@ array[0,1,2,3,4,5,6]::smallint[]
                                ),
  -- Publish hour UTC. NULL = 16:00 (9am PT / noon ET).
  post_hour_utc     smallint    check (post_hour_utc is null or post_hour_utc between 0 and 23),

  -- Voice for the generated copy (matches lib/actions/social.ts Tone).
  tone              text        not null default 'professional'
                                check (tone in ('professional','casual','witty','promotional','educational')),

  -- The Monday of the last week generated — idempotency guard so a re-run of
  -- the weekly cron never double-posts.
  last_generated_week date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id)
);

create index if not exists idx_org_social_autopilot_org
  on org_social_autopilot(organization_id);

alter table org_social_autopilot enable row level security;

create policy "org_members_social_autopilot" on org_social_autopilot
  for all
  using (organization_id in (select get_user_org_ids()))
  with check (organization_id in (select get_user_org_ids()));

create trigger set_updated_at_org_social_autopilot
  before update on org_social_autopilot
  for each row execute function set_updated_at();

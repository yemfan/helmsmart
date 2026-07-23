-- Social auto-post controller.
--
-- Before this, the only things an agent could actually control were the
-- approval mode and (via SQL only — there was no setter or UI) posts_per_week.
-- Autopilot fanned out to EVERY connected account, picked content categories at
-- random, published at a hard-coded 16:00 UTC, and derived its days from the
-- cadence. These columns are the missing knobs.
--
-- All are NULLABLE and mean "no preference" so existing rows keep today's
-- behaviour exactly — nobody's automation changes until they open the control.

alter table public.boss_autopilot_settings
  -- Which platforms to auto-post to. NULL = every connected account (today's
  -- behaviour). Values match scheduled_posts.platform.
  add column if not exists platforms text[],
  -- Which social_content_library categories to draw evergreen posts from.
  -- NULL = any category.
  add column if not exists content_categories text[],
  -- Include the weekly timely/news post (max 1 per period) in the mix.
  add column if not exists include_timely boolean not null default true,
  -- Cap on posts placed on a single day. NULL = one per day.
  add column if not exists posts_per_day smallint,
  -- Allowed weekdays, 0=Sunday … 6=Saturday (matches JS getUTCDay).
  -- NULL = any day (days get derived from the cadence, as today).
  add column if not exists post_days smallint[],
  -- First publish hour of the day, UTC. NULL = 16 (9am PT / noon ET).
  add column if not exists post_hour_utc smallint,
  -- Full AI automation: the AI picks platforms, content mix and cadence each
  -- period and the manual knobs above become advisory.
  add column if not exists ai_managed boolean not null default false;

-- ── Constraints ─────────────────────────────────────────────────────────────
-- `<@` (contained-by) validates every array element without a trigger.

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_platforms_check;
alter table public.boss_autopilot_settings
  add constraint boss_autopilot_platforms_check
    check (
      platforms is null
      or platforms <@ array['facebook', 'instagram', 'linkedin', 'threads', 'x']::text[]
    );

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_content_categories_check;
alter table public.boss_autopilot_settings
  add constraint boss_autopilot_content_categories_check
    check (
      content_categories is null
      or content_categories <@ array[
        'buying', 'selling', 'financing', 'market_basics',
        'pitfalls', 'how_to', 'staging', 'negotiation', 'brand'
      ]::text[]
    );

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_posts_per_day_check;
alter table public.boss_autopilot_settings
  add constraint boss_autopilot_posts_per_day_check
    check (posts_per_day is null or (posts_per_day between 1 and 5));

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_post_days_check;
alter table public.boss_autopilot_settings
  add constraint boss_autopilot_post_days_check
    check (post_days is null or post_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_post_hour_check;
alter table public.boss_autopilot_settings
  add constraint boss_autopilot_post_hour_check
    check (post_hour_utc is null or (post_hour_utc between 0 and 23));

comment on column public.boss_autopilot_settings.platforms is
  'Auto-post target platforms. NULL = every connected account.';
comment on column public.boss_autopilot_settings.post_days is
  'Allowed weekdays, 0=Sunday..6=Saturday. NULL = derive from cadence.';
comment on column public.boss_autopilot_settings.ai_managed is
  'When true the AI chooses platforms/content/cadence each period.';

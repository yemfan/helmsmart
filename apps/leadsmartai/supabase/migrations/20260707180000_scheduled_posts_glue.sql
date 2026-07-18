-- Social-publish glue: connect the weekly Marketing Assistant social
-- recommendations (social_post_recommendations) to the EXISTING publish
-- engine (scheduled_posts → /api/cron/publish-scheduled → publishPost).
--
-- Nothing here rebuilds the publish engine. Three additive changes:
--
--   1. scheduled_posts.platform check — re-assert it includes 'linkedin'.
--      (Already widened by 20260629000000_linkedin_organic.sql; this is a
--      defensive idempotent re-assert so the glue is self-contained. The
--      constraint name is the anon default `scheduled_posts_platform_check`,
--      which 20260629000000 named explicitly — same name here.)
--
--   2. scheduled_posts.image_url — carries OUR branded-card URL (a PUBLIC url
--      in the `social-images` bucket) directly, since recommendation cards do
--      NOT live in media_library. publishPost prefers this when there's no
--      media_library_id; the media_library path is untouched.
--
--   3. social_post_recommendations.status check — add 'scheduled' so an
--      approved-and-queued rec can be marked scheduled. That check is an
--      INLINE (anonymously named) constraint from
--      20260707140001_social_post_recommendations.sql, so we discover its real
--      name from the catalog before dropping + recreating.

-- ── 1. scheduled_posts.platform — assert linkedin is allowed ──────────
alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_platform_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin'));

-- ── 2. scheduled_posts.image_url ─────────────────────────────────────
alter table public.scheduled_posts
  add column if not exists image_url text;

comment on column public.scheduled_posts.image_url is
  'Direct public image URL to publish (e.g. a branded social-images card that is NOT in media_library). publishPost uses this when media_library_id is null; the media_library path is unchanged.';

-- ── 3. social_post_recommendations.status — add 'scheduled' ──────────
-- The status check is an inline/anonymous constraint. Find its real name
-- (any CHECK on this table referencing the `status` column) and drop it,
-- then recreate the widened check with the same explicit name.
do $$
declare
  v_conname text;
begin
  select con.conname
    into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'social_post_recommendations'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
    and pg_get_constraintdef(con.oid) ilike '%suggested%'
  limit 1;

  if v_conname is not null then
    execute format(
      'alter table public.social_post_recommendations drop constraint %I',
      v_conname
    );
  end if;

  -- Recreate with an explicit, stable name including the new 'scheduled' value.
  alter table public.social_post_recommendations
    add constraint social_post_recommendations_status_check
      check (status in ('suggested', 'approved', 'dismissed', 'copied', 'scheduled'));
end $$;

comment on column public.social_post_recommendations.status is
  'suggested (approval mode) / approved (autopilot or approved) / dismissed / copied / scheduled (queued into scheduled_posts for real publishing).';

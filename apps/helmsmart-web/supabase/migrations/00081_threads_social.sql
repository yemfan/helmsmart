-- Threads publishing for HelmSmart.
--
-- Only one schema change is needed: widen social_posts.platform to allow
-- 'threads'. Connections reuse the generic org_oauth_tokens table
-- (provider='threads'), whose `provider` column has no CHECK constraint, so
-- nothing there needs altering.

alter table public.social_posts
  drop constraint if exists social_posts_platform_check;

alter table public.social_posts
  add constraint social_posts_platform_check
    check (platform in ('x', 'linkedin', 'facebook', 'instagram', 'threads'));

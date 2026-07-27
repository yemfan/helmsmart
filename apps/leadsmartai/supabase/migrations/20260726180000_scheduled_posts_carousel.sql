-- Carousels through the scheduler (reach Phase 3a). A scheduled_posts row with
-- carousel_id set is a multi-image carousel: the publish-scheduled cron renders
-- the deck's slide URLs and calls publishCarousel instead of the single-image
-- publishPost. image_url/media_library_id stay null for these rows.

alter table public.scheduled_posts
  add column if not exists carousel_id uuid references public.social_carousels(id) on delete set null;

create index if not exists scheduled_posts_carousel_idx
  on public.scheduled_posts (carousel_id)
  where carousel_id is not null;

comment on column public.scheduled_posts.carousel_id is
  'When set, this scheduled post is a carousel (social_carousels.id); the cron multi-image-publishes it.';

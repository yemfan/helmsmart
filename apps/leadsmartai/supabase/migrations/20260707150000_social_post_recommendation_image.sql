alter table public.social_post_recommendations
  add column if not exists image_url text,
  add column if not exists image_source text not null default 'branded_card';
comment on column public.social_post_recommendations.image_url is 'Stored branded card (or custom uploaded) image in the social-images bucket. Rendered at generation time; NULL falls back to the on-the-fly /api/social/card/[id] route.';
comment on column public.social_post_recommendations.image_source is 'branded_card | custom | stock | ai — how image_url was produced.';

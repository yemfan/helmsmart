-- Optional per-org image-ad template for social autopilot.
--
-- When set (e.g. 'scam_decision_tree'), autopilot renders a branded image ad for
-- each post, attaches it via social_posts.media_url, and uses the template's own
-- caption instead of the plain-text drafter. NULL (the default) keeps today's
-- text-only behaviour, so existing orgs are unaffected.

alter table public.org_social_autopilot
  add column if not exists ad_template text;

comment on column public.org_social_autopilot.ad_template is
  'Optional image-ad template for autopilot posts, e.g. ''scam_decision_tree''. NULL = plain text posts.';

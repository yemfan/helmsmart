-- Apply the money-keyword columns that 20260443000000 declared but never got.
--
-- The seo-expand job has been failing every night at 03:30 with
--
--   PGRST204: Could not find the 'money_keyword' column of 'seo_expansion_queue'
--
-- because lib/seo-generator/expansion.ts upserts money_keyword and
-- money_keyword_slug, and the columns are not there. The migration that adds
-- them is in the repo — 20260443000000_seo_money_keyword_leads_attribution.sql
-- — it simply was never applied to this database. Repo and production drifted.
--
-- That migration cannot be applied as written any more. Its last two statements
-- do `alter table public.leads add column`, and `leads` is now a VIEW over
-- `contacts`; ADD COLUMN on a view fails outright, and `if exists` does not
-- help because the relation does exist, just not as a table. So the same
-- columns land on `contacts`, which is where lead rows actually live, and the
-- view picks them up when it is next rebuilt.
--
-- Every statement is idempotent, so this is safe whether or not any part of the
-- original was ever run by hand.

alter table if exists public.seo_pages
  add column if not exists money_keyword text null;

alter table if exists public.seo_pages
  add column if not exists money_keyword_slug text null;

alter table if exists public.seo_expansion_queue
  add column if not exists money_keyword text null;

alter table if exists public.seo_expansion_queue
  add column if not exists money_keyword_slug text null;

comment on column public.seo_pages.money_keyword is
  'Buyer-intent phrase for the city_money_keyword template (e.g. luxury homes).';

comment on column public.seo_pages.money_keyword_slug is
  'URL segment before -in-{city} (e.g. good-schools).';

comment on column public.seo_expansion_queue.money_keyword is
  'Buyer-intent phrase queued for a city_money_keyword page.';

comment on column public.seo_expansion_queue.money_keyword_slug is
  'URL segment for the queued money-keyword page.';

-- Lead attribution. Originally written against `leads`; that is a view now, so
-- the columns belong on the base table.
alter table if exists public.contacts
  add column if not exists landing_page text null;

alter table if exists public.contacts
  add column if not exists seo_slug text null;

comment on column public.contacts.landing_page is
  'Path the lead submitted from (e.g. /homes-under-800k-in-pasadena).';

comment on column public.contacts.seo_slug is
  'Programmatic SEO slug segment, when the lead came from one.';

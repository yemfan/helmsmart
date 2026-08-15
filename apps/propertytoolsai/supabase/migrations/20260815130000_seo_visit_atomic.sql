-- Atomic SEO page-visit counter.
--
-- WHY: incrementSeoPageVisit did SELECT visit_count -> UPDATE, on every page
-- view of a public SEO page. Two problems:
--
--   1. COST. Two round trips per view on a catch-all route. In
--      pg_stat_statements this UPDATE alone was 3,130 calls at ~28ms, and the
--      seo_* selects dominated the whole database: 300k calls on
--      market_geographies, 392k on seo_cluster_pages, 1.1M PostgREST requests
--      total. That load pegged a shared-CPU instance and took the database
--      down for every app sharing it.
--
--   2. CORRECTNESS. Read-modify-write loses concurrent increments: two
--      simultaneous views both read N and both write N+1, so the count drifts
--      low exactly on the pages that are most popular.
--
-- A single statement fixes both — one round trip, and the increment happens
-- inside the row lock so nothing is lost.

CREATE OR REPLACE FUNCTION public.increment_seo_page_visit(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.seo_pages
     SET visit_count = visit_count + 1,
         last_visited_at = now()
   WHERE slug = lower(btrim(p_slug));
$$;

COMMENT ON FUNCTION public.increment_seo_page_visit(text) IS
  'Atomically bump visit_count/last_visited_at for one SEO page. Replaces a read-modify-write that cost two round trips per pageview and lost concurrent increments.';

-- Service-role only: called from the server on page render, never by a browser.
REVOKE ALL ON FUNCTION public.increment_seo_page_visit(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_seo_page_visit(text) TO service_role;

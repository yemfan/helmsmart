/**
 * The site's own absolute origin, for canonical URLs, `hreflang`, the sitemap
 * and `robots.txt`.
 *
 * One place because it was three, and two of them were wrong: `sitemap.ts` and
 * `robots.ts` both fell back to `https://helmsmart.app`, a domain this product
 * does not use. A wrong absolute URL in a canonical tag is worse than a missing
 * one — it points search engines at a host that will not answer, and this repo
 * has already lost traffic once to a stale `NEXT_PUBLIC_APP_URL`
 * (leadsmart-ai.com, retired while links still pointed at it).
 *
 * The fallback is the real production host, so a missing env var degrades to
 * correct rather than to a typo.
 */
const PRODUCTION_ORIGIN = "https://www.helmsmart.ai";

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return PRODUCTION_ORIGIN;
  return configured.replace(/\/$/, "");
}

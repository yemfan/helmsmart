import type { MetadataRoute } from "next";
import { listClusterGuideEntriesForSitemap } from "@/lib/clusterGenerator/db";
import { listSerpHubEntriesForSitemap } from "@/lib/serpDominator/db";
import { getProgrammaticSeoUrlPaths } from "@/lib/programmaticSeo";
import { getSeoSitemapEntries } from "@/lib/seo-generator/sitemap";
import { listResearchReportsForSitemap } from "@/lib/research/db";
import { listMarketSitemapEntries } from "@/lib/research/warehouse/read";
import { TRAFFIC_CITIES } from "@/lib/trafficSeo";

/**
 * `lastModified` and `changeFrequency` are intentionally omitted for routes
 * where we cannot produce an honest per-URL timestamp. Previously every entry
 * was stamped with `new Date()` at generation time, which Google's spam
 * classifier reads as a manipulation signal — a uniform lastmod across ~1,000
 * programmatic URLs is exactly the profile the March 2024 scaled-content-abuse
 * guidance targets. When the timestamp isn't real, the sitemap spec explicitly
 * allows (and Google prefers) omitting it. See validation report SEO-03/QA-01.
 *
 * Routes that DO have real timestamps (DB-backed programmatic SEO pages via
 * `getSeoSitemapEntries`) continue to emit a real lastModified.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");

  const programmaticToolLocationRoutes = getProgrammaticSeoUrlPaths();

  let clusterGuideEntries: { path: string; updatedAt: string | null }[] = [];
  let serpHubEntries: { path: string; updatedAt: string | null }[] = [];
  let researchEntries: { path: string; updatedAt: string | null }[] = [];
  let marketEntries: { path: string; lastmod: string | null }[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      clusterGuideEntries = await listClusterGuideEntriesForSitemap();
    } catch {
      clusterGuideEntries = [];
    }
    try {
      serpHubEntries = await listSerpHubEntriesForSitemap();
    } catch {
      serpHubEntries = [];
    }
    try {
      researchEntries = (await listResearchReportsForSitemap()).map((r) => ({
        path: `/data/reports/${r.slug}`,
        updatedAt: r.updatedAt,
      }));
    } catch {
      researchEntries = [];
    }
    try {
      marketEntries = await listMarketSitemapEntries();
    } catch {
      marketEntries = [];
    }
  }

  const staticRoutes = [
    "/",
    "/guides",
    "/home-value",
    "/methodology",
    "/affordability",
    "/match",
    "/landing/home-value",
    "/landing/mortgage-calculator",
    "/content/video-scripts",
    "/serp-hub",
    "/data",
    "/blog",
    "/about",
    "/contact",
    "/pricing",
    "/blog/how-to-estimate-your-home-value",
    "/blog/real-estate-market-trends-2026",
    "/blog/mortgage-calculator-guide",
    "/blog/rent-vs-buy-decision-guide",
    "/blog/how-to-sell-your-house-fast",
    "/blog/real-estate-investment-strategies-beginners",
    "/blog/what-is-cap-rate",
    "/blog/how-to-calculate-cap-rate",
    "/blog/cap-rate-vs-cash-on-cash-return",
    "/blog/cap-rate-calculator-how-to-use-it",
    "/blog/why-cap-rate-matters-for-real-estate-investors",
    "/blog/how-cap-rate-affects-property-value",
    "/blog/cap-rate-formula-explained-for-beginners",
    "/blog/what-is-a-good-cap-rate-for-rental-property",
    "/blog/cap-rate-vs-gross-rent-multiplier",
    "/blog/cap-rate-vs-roi",
    "/blog/cap-rate-vs-internal-rate-of-return-irr",
    "/blog/how-to-analyze-a-property-using-cap-rate",
    "/blog/how-to-increase-cap-rate-on-rental-property",
    "/blog/cap-rate-by-city-in-the-united-states",
    "/blog/how-cap-rate-changes-in-different-markets",
    "/blog/cap-rate-for-multifamily-investments",
    "/blog/cap-rate-example-for-rental-property",
    "/blog/cap-rate-mistakes-real-estate-investors-make",
    "/blog/how-banks-use-cap-rate-to-value-property",
  ];

  const seoRoutes = TRAFFIC_CITIES.flatMap((c) => [
    `/home-value/${c.slug}`,
    `/sell-house/${c.slug}`,
    `/market-report/${c.slug}`,
  ]);
  // Keyword-variant routes (home-value/[city]/[keyword], etc.) are now
  // noindex-crawlable — they canonicalize to their parent /{tool}/{city}
  // hub. They're intentionally excluded from the sitemap because
  // submitting noindex URLs is contradictory and Google downweights
  // sitemaps that mix indexable + noindex URLs. Validation report SEO-03.

  let programmaticCitySeo: MetadataRoute.Sitemap = [];
  try {
    programmaticCitySeo = await getSeoSitemapEntries();
  } catch {
    programmaticCitySeo = [];
  }

  // Routes without a trustworthy per-URL timestamp — omit lastmod entirely.
  const pathEntries: MetadataRoute.Sitemap = [
    ...staticRoutes,
    ...seoRoutes,
    ...programmaticToolLocationRoutes,
  ].map((path) => ({
    url: `${base}${path}`,
    priority: path === "/" ? 1 : 0.7,
  }));

  // DB-backed routes with real updated_at — emit honest lastmod.
  const dynamicEntries: MetadataRoute.Sitemap = [
    ...clusterGuideEntries,
    ...serpHubEntries,
    ...researchEntries,
  ].map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: entry.updatedAt ? new Date(entry.updatedAt) : undefined,
    priority: 0.7,
  }));

  // Data Center market pages (~350 URLs) with real per-geo lastmod (newest
  // metric period). Guarded + try/caught above so this can't crash the sitemap.
  const marketSitemapEntries: MetadataRoute.Sitemap = marketEntries.map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: entry.lastmod ? new Date(`${entry.lastmod}T00:00:00Z`) : undefined,
    priority: entry.path === "/data/markets" ? 0.8 : 0.6,
  }));

  return [
    ...pathEntries,
    ...dynamicEntries,
    ...marketSitemapEntries,
    ...programmaticCitySeo,
  ];
}


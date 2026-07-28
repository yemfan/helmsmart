import type { MetadataRoute } from "next";
import { listTrafficMetros, getKeywordPagesForMetro } from "@/lib/trafficMetros";
import { HELP_GUIDES } from "@/lib/help/guides";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { SWITCH_SOURCES } from "@/lib/marketing/switch-from";
import { listResearchReportsForSitemap } from "@/lib/research/db";
import { listMarketSitemapEntries } from "@/lib/research/warehouse/read";
import { listRecentDigests } from "@/lib/newsletter/db";
import { FEATURE_PAGES } from "@/lib/marketing/features";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Use the same resolver as robots.ts. The old
  // `NEXT_PUBLIC_SITE_URL || "http://localhost:3000"` fallback silently emitted
  // a sitemap full of localhost URLs (which Google discards) whenever that env
  // var was missing on the deployment — a total, invisible indexing failure.
  // getSiteUrl() falls back to the real production host instead.
  const base = getSiteUrl().replace(/\/$/, "");
  const now = new Date();

  const staticRoutes = [
    "/",
    "/home-value",
    "/landing/home-value",
    "/landing/mortgage-calculator",
    "/content/video-scripts",
    // Public marketing surfaces — high SEO priority alongside the
    // home page since they're the primary conversion targets from
    // organic search.
    "/features",
    "/about",
    "/pricing",
    "/agent/pricing",
    "/agent/coaching",
    "/agent/compare",
    "/integrations",
    "/free-tools",
    "/skills-library",
    "/try-demo",
    "/contact",
    // Data Center hub — original, cited market-intelligence reports (agent lens).
    "/data",
    // Weekly Regional Newsletter hub — consumer rates + housing briefing.
    "/newsletter",
    // Note: /agent and /broker are role portals (robots: noindex) — excluded.
    // /demo/* sandbox pages are explicitly `robots: { index: false }`
    // — keep them out of the sitemap so they don't drain crawl budget.
  ];

  // Calculator hub — every public calculator page is indexable
  // and was previously orphaned from the sitemap, leaving Google
  // to discover them via crawl alone.
  const calculatorRoutes = [
    "/mortgage-calculator",
    "/affordability-calculator",
    "/cap-rate-calculator",
    "/cap-rate-roi-calculator",
    "/cash-flow-calculator",
    "/down-payment-calculator",
    "/refinance-calculator",
    "/rent-vs-buy-calculator",
    "/roi-calculator",
    "/adjustable-rate-calculator",
    "/cap-rate-calculator-how-to-use-it",
    "/how-to-calculate-cap-rate",
  ];

  // User-facing help hub — index, FAQ, and one page per how-to
  // guide. The FAQPage + HowTo JSON-LD on these pages are the
  // primary SERP rich-result targets.
  const helpRoutes = [
    "/help",
    "/help/faq",
    ...HELP_GUIDES.map((g) => `/help/guides/${g.slug}`),
  ];

  // Blog index + per-post pages. The registry lives in lib/blog/posts.ts
  // so adding a post is one append + this sitemap re-renders automatically.
  const blogRoutes = ["/blog", ...BLOG_POSTS.map((p) => p.href)];

  // CRM migration landing pages — bottom-of-funnel conversion surface
  // for agents leaving LionDesk, Follow Up Boss, kvCORE, etc.
  const switchFromRoutes = [
    "/switch-from",
    ...SWITCH_SOURCES.map((s) => `/switch-from/${s.slug}`),
  ];

  // Programmatic city pages are driven by the Data Center warehouse (~305 active
  // metros, real figures). Never throws — listTrafficMetros() falls back to the
  // curated seed list if the warehouse is unreachable.
  const metros = await listTrafficMetros();
  const seoRoutes = metros.flatMap((m) => [
    `/home-value/${m.slug}`,
    `/sell-house/${m.slug}`,
    `/market-report/${m.slug}`,
  ]);
  // Long-tail keyword URLs only for the largest metros — going to all ~305 would
  // emit tens of thousands of thin, near-duplicate pages (doorway-page risk).
  const KEYWORD_METRO_LIMIT = 40;
  const keywordRoutes = metros.slice(0, KEYWORD_METRO_LIMIT).flatMap((m) => [
    ...getKeywordPagesForMetro("home-value", m).map((k) => `/home-value/${m.slug}/${k.keywordSlug}`),
    ...getKeywordPagesForMetro("sell-house", m).map((k) => `/sell-house/${m.slug}/${k.keywordSlug}`),
    ...getKeywordPagesForMetro("market-report", m).map((k) => `/market-report/${m.slug}/${k.keywordSlug}`),
  ]);

  const HIGH_PRIORITY = new Set([
    "/",
    "/features",
    "/about",
    "/pricing",
    "/agent/pricing",
    "/agent/coaching",
    "/agent/compare",
    "/integrations",
    "/free-tools",
    "/try-demo",
    "/data",
    "/newsletter",
  ]);

  // Per-feature marketing landing pages (/features/{slug}) — one indexable page
  // per product pillar, the primary organic surface for high-intent feature
  // queries. HIGH_PRIORITY so they're weighted alongside the marketing hub.
  const featureRoutes = FEATURE_PAGES.map((f) => `/features/${f.slug}`);
  featureRoutes.forEach((r) => HIGH_PRIORITY.add(r));

  const staticEntries = [
    ...staticRoutes,
    ...featureRoutes,
    ...calculatorRoutes,
    ...helpRoutes,
    ...blogRoutes,
    ...switchFromRoutes,
    ...seoRoutes,
    ...keywordRoutes,
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : HIGH_PRIORITY.has(path) ? 0.9 : 0.7,
  }));

  // Data Center research reports — DB-driven, one entry per published report.
  // Guarded so a missing table/env (or the shared research_reports being
  // unreachable) can never crash the sitemap; fall back to no report entries.
  let reportEntries: MetadataRoute.Sitemap = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      const reports = await listResearchReportsForSitemap();
      reportEntries = reports.map((r) => ({
        url: `${base}/data/reports/${r.slug}`,
        lastModified: r.updatedAt ? new Date(r.updatedAt) : now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    } catch {
      reportEntries = [];
    }
  }

  // Data Center market pages — DB-driven, one entry per active state + metro
  // (~350 URLs) plus the markets hub. Guarded exactly like the report entries so
  // a missing table/env (or the shared warehouse being unreachable) can never
  // crash the sitemap; fall back to no market entries.
  let marketEntries: MetadataRoute.Sitemap = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      const entries = await listMarketSitemapEntries();
      marketEntries = entries.map((e) => ({
        url: `${base}${e.path}`,
        lastModified: e.lastmod ? new Date(e.lastmod) : now,
        changeFrequency: "weekly" as const,
        priority: e.path === "/data/markets" ? 0.8 : 0.6,
      }));
    } catch {
      marketEntries = [];
    }
  }

  // Weekly Regional Newsletter — one entry per published national issue
  // (/newsletter/national/<week>). Guarded exactly like the report/market
  // entries so a missing table/env can never crash the sitemap.
  let newsletterEntries: MetadataRoute.Sitemap = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      const digests = await listRecentDigests(52);
      newsletterEntries = digests.map((d) => ({
        url: `${base}/newsletter/national/${d.week_of}`,
        lastModified: d.created_at ? new Date(d.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    } catch {
      newsletterEntries = [];
    }
  }

  return [
    ...staticEntries,
    ...reportEntries,
    ...marketEntries,
    ...newsletterEntries,
  ];
}


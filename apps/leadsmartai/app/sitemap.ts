import type { MetadataRoute } from "next";
import { getKeywordPagesForCity, TRAFFIC_CITIES } from "@/lib/trafficSeo";
import { HELP_GUIDES } from "@/lib/help/guides";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { SWITCH_SOURCES } from "@/lib/marketing/switch-from";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
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
    "/try-demo",
    "/contact",
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

  const seoRoutes = TRAFFIC_CITIES.flatMap((c) => [
    `/home-value/${c.slug}`,
    `/sell-house/${c.slug}`,
    `/market-report/${c.slug}`,
  ]);
  const keywordRoutes = TRAFFIC_CITIES.flatMap((c) => [
    ...getKeywordPagesForCity("home-value", c.slug).map((k) => `/home-value/${c.slug}/${k.keywordSlug}`),
    ...getKeywordPagesForCity("sell-house", c.slug).map((k) => `/sell-house/${c.slug}/${k.keywordSlug}`),
    ...getKeywordPagesForCity("market-report", c.slug).map((k) => `/market-report/${c.slug}/${k.keywordSlug}`),
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
  ]);

  return [
    ...staticRoutes,
    ...calculatorRoutes,
    ...helpRoutes,
    ...blogRoutes,
    ...switchFromRoutes,
    ...seoRoutes,
    ...keywordRoutes,
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : HIGH_PRIORITY.has(path) ? 0.9 : 0.7,
  }));
}


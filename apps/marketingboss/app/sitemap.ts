import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";
import { contentRoutes } from "@/lib/marketing/seoContent";

/**
 * Only genuinely public pages belong here. The app surface (/studio, /autopilot,
 * /settings, /gallery, …) is behind auth and would be a dead end in search
 * results — those are disallowed in robots.ts instead.
 *
 * /login is public but deliberately omitted: a sitemap lists pages you want
 * ranked, and a sign-in form isn't one.
 *
 * Guides and comparisons are derived from lib/marketing/seoContent, so adding
 * an entry there publishes the page AND lists it here — there is no second
 * place to remember to update.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const lastModified = new Date();

  const marketing: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified, changeFrequency: "weekly", priority: 1.0 },
    // Highest commercial intent after the homepage.
    { url: `${baseUrl}/pricing`, lastModified, changeFrequency: "monthly", priority: 0.9 },
  ];

  const content: MetadataRoute.Sitemap = contentRoutes().map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: "monthly",
    // Index pages outrank their children as entry points.
    priority: path.split("/").length === 2 ? 0.7 : 0.6,
  }));

  const legal: MetadataRoute.Sitemap = ["/privacy", "/terms"].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [...marketing, ...content, ...legal];
}

import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Every route in this app except the marketing pages is behind auth. Crawlers
 * following them get a login redirect, which wastes crawl budget and can
 * surface useless entries in search — so the app surface is disallowed
 * explicitly rather than left to chance.
 */
const APP_ROUTES = [
  "/actions",
  "/admin",
  "/api",
  "/autopilot",
  "/billing",
  "/compose",
  "/connections",
  "/gallery",
  "/learning",
  "/opportunities",
  "/performance",
  "/playbooks",
  "/published",
  "/settings",
  "/studio",
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Prefix match, no trailing slash — "/studio" blocks /studio,
        // /studio/ and /studio/gallery; "/studio/" would miss /studio itself.
        disallow: APP_ROUTES,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

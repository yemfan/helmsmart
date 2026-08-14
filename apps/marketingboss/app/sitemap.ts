import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Only the genuinely public marketing pages belong here. Everything else in
 * this app (/studio, /autopilot, /settings, /gallery, …) is behind auth and
 * would be a dead end in search results — those are disallowed in robots.ts.
 *
 * /login is public but deliberately omitted: a sitemap should list pages you
 * want ranked, and a sign-in form isn't one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const lastModified = new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

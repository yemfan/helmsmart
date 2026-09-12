/**
 * robots.txt for the public site.
 *
 * The `allow` list is path-by-path, so the locale-prefixed marketing URLs need
 * their prefixes named or the Chinese and Spanish pages stay uncrawlable — the
 * exact problem the prefixes were added to solve. `/zh/` and `/es/` cover every
 * localized page at once, present and future.
 *
 * The origin comes from `lib/site-url`. Both this file and `sitemap.ts` used to
 * fall back to `https://helmsmart.app`, which is not a host this product
 * answers on: a wrong absolute URL in `robots.txt` sends crawlers to the wrong
 * place, and pointing them at a sitemap that will not load is worse than
 * publishing no sitemap line at all.
 */

import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/features",
          "/pricing",
          "/blog",
          "/faq",
          "/privacy",
          "/terms",
          "/contact",
          "/about",
          // Every localized marketing page lives under one of these.
          "/zh/",
          "/es/",
        ],
        disallow: [
          "/api/",
          "/dashboard/",
          "/home/",
          "/admin/",
          "/_next/",
          "/static/",
          "/*.json$",
          "/?*utm_*",
          "/?*sort=",
          "/?*page=",
          // The client-facing capability-token pages: a payment link, a portal
          // and a reschedule link are addressed to one person and must not be
          // indexed, in any language.
          "/pay/",
          "/portal/",
          "/reschedule/",
        ],
      },
      {
        userAgent: "AdsBot-Google",
        allow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

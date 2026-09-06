import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().replace(/\/$/, "");

  // Public marketing pages that live UNDER a disallowed prefix. `/agent/` is
  // blocked below (the role portal + its authed subroutes), but these three are
  // indexable, canonical, HIGH_PRIORITY sitemap entries. A more-specific Allow
  // overrides the broader Disallow in Google/Bing's longest-match rule, so these
  // get crawled while the rest of /agent/ stays blocked. Without this they were
  // in the sitemap yet uncrawlable — a self-inflicted indexing block.
  const allowedPaths = [
    "/",
    "/agent/pricing",
    "/agent/coaching",
    "/agent/compare",
  ];

  const restrictedPaths = [
    // Auth & account management
    "/auth/",
    "/account/",
    // Internal dashboards & admin
    "/admin/",
    "/rbac/",
    "/agent/",
    "/broker/",
    "/portal/",
    "/dashboard/",
    "/dashboard-router",
    // API endpoints
    "/api/",
    // Private flows
    "/billing/",
    "/upgrade-to-agent",
    "/agent-signup",
    "/agent-home-value-leads",
    "/unauthorized",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: allowedPaths,
        disallow: restrictedPaths,
      },
      // Allow AI search crawlers with same restrictions
      {
        userAgent: ["GPTBot", "ChatGPT-User", "Claude-Web"],
        allow: "/",
        disallow: restrictedPaths,
      },
      // Block training-only crawlers
      { userAgent: "Google-Extended", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
    // No `host:`. It emits a `Host:` line, which is a Yandex directive — Google
    // ignores it and reports "Rule ignored by Googlebot" against robots.txt in
    // Search Console. The canonical tag already states the preferred host, and a
    // standing warning on a file this important trains you to ignore the file.
  };
}

/**
 * Sitemap for the public site.
 *
 * Every translated marketing page is published once PER LANGUAGE, each entry
 * carrying the `alternates.languages` set that ties the three together. That is
 * the whole point of the locale-prefixed URLs: a crawler sends no cookie and no
 * `Accept-Language`, so before this it could only ever reach the English copy —
 * measured at 6 CJK characters on the Chinese homepage against 1,788 for the
 * same URL requested with `Accept-Language: zh-CN`.
 *
 * Blog posts are listed at their bare path only. They are database records in
 * one language; advertising `/zh/blog/<slug>` would promise a translation that
 * does not exist.
 */

import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/server";

import { LOCALE_PREFIX, LOCALIZED_PATHS, localizedPath } from "@/lib/i18n/routing";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { siteUrl } from "@/lib/site-url";

/** How often each page changes, and how much it matters. Keyed by bare path. */
const PAGE_META: Record<
  string,
  { changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }
> = {
  "/": { changeFrequency: "weekly", priority: 1.0 },
  "/features": { changeFrequency: "monthly", priority: 0.8 },
  "/pricing": { changeFrequency: "monthly", priority: 0.8 },
  "/faq": { changeFrequency: "monthly", priority: 0.6 },
  "/about": { changeFrequency: "monthly", priority: 0.5 },
  "/contact": { changeFrequency: "monthly", priority: 0.5 },
  "/contact/sales": { changeFrequency: "monthly", priority: 0.5 },
  "/privacy": { changeFrequency: "yearly", priority: 0.3 },
  "/terms": { changeFrequency: "yearly", priority: 0.3 },
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl();
  const abs = (path: string) => `${baseUrl}${path === "/" ? "" : path}` || baseUrl;
  const now = new Date();

  const urls: MetadataRoute.Sitemap = [];

  for (const path of LOCALIZED_PATHS) {
    const meta = PAGE_META[path] ?? { changeFrequency: "monthly" as const, priority: 0.5 };
    // The same language set on every entry for this page, so each localized URL
    // points at its siblings and at the negotiating bare path as x-default.
    const languages: Record<string, string> = { "x-default": abs(path), en: abs(path) };
    for (const [locale, prefix] of Object.entries(LOCALE_PREFIX)) {
      languages[locale] = abs(path === "/" ? `/${prefix}` : `/${prefix}${path}`);
    }
    for (const locale of SUPPORTED_LOCALES) {
      urls.push({
        url: abs(localizedPath(path, locale)),
        lastModified: now,
        changeFrequency: meta.changeFrequency,
        priority: meta.priority,
        alternates: { languages },
      });
    }
  }

  // Blog index and posts — one language, bare path only.
  urls.push({
    url: abs("/blog"),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  });

  try {
    const supabase = await createServiceClient();
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("status", "published")
      .limit(100);

    for (const post of posts ?? []) {
      urls.push({
        url: abs(`/blog/${post.slug}`),
        lastModified: post.updated_at ? new Date(post.updated_at) : now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // The blog table may not exist in every environment; the marketing pages
    // above are the part that must always be published.
  }

  return urls;
}

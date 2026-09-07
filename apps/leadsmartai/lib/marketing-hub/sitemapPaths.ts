import { areaSlug } from "./areas";
import type { HubConfig } from "./config";
import { isIndexable } from "./feedItems";
import { availablePages, type HubPageFacts } from "./pages";

/**
 * Which paths one agent hub contributes to the sitemap. Pure, so the rules
 * (index bar, layout, areas) are tested without a database; the reading
 * lives in sitemap.ts.
 */

export type HubSitemapEntry = { path: string; priority: number };

export function hubSitemapPaths(args: {
  username: string;
  config: HubConfig;
  hasSavedConfig: boolean;
  serviceAreas: string[];
  feedCount: number;
  bio: string | null;
}): HubSitemapEntry[] {
  const { username, config } = args;
  if (config.seo.noindex) return [];
  // The same bar the page itself applies before it drops `noindex`.
  if (!isIndexable({ published: true, bio: args.bio, feedCount: args.feedCount })) return [];
  const root = `/@${username}`;
  const out: HubSitemapEntry[] = [{ path: root, priority: 0.7 }];
  const areas = config.areas.items.length ? config.areas.items.map((a) => a.name) : args.serviceAreas;
  if (config.appearance.layout === "pages") {
    const facts: HubPageFacts = {
      config,
      hasSavedConfig: args.hasSavedConfig,
      areaCount: areas.length,
      feedCount: args.feedCount,
      hasAbout: Boolean(args.bio),
    };
    for (const page of availablePages(facts)) out.push({ path: `${root}/${page}`, priority: 0.5 });
  }
  if (config.areas.enabled) {
    for (const name of areas) {
      const slug = areaSlug(name);
      if (slug) out.push({ path: `${root}/area/${slug}`, priority: 0.5 });
    }
  }
  return out;
}

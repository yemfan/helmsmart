import { servicesToRender, toolKeysToRender, type HubConfig } from "./config";

/**
 * The hub as a multi-page site.
 *
 * Which pages exist for a given hub, and where a section link should go.
 * A page is offered only when it would have something on it — an agent
 * with no services has no Services page, and no menu entry for one.
 *
 * In the `single` layout the same keys resolve to anchors on the home page,
 * so every component links through `sectionHref` and never hard-codes
 * either form.
 *
 * Pure: takes the hub's config and a few counts, returns paths.
 */

export const HUB_PAGE_KEYS = ["about", "services", "tools", "areas", "posts", "contact"] as const;
export type HubPageKey = (typeof HUB_PAGE_KEYS)[number];

export type HubPageFacts = {
  config: HubConfig;
  hasSavedConfig: boolean;
  /** Service areas the page would list (config areas, else profile areas). */
  areaCount: number;
  feedCount: number;
  /** Whether the About page has anything beyond the name: bio, facts, team, testimonials. */
  hasAbout: boolean;
};

export function pageAvailable(key: HubPageKey, f: HubPageFacts): boolean {
  switch (key) {
    case "about":
      return f.hasAbout;
    case "services":
      return f.config.services.enabled && servicesToRender(f.config, f.hasSavedConfig).length > 0;
    case "tools":
      return f.config.tools.enabled && toolKeysToRender(f.config, f.hasSavedConfig).length > 0;
    case "areas":
      return f.config.areas.enabled && f.areaCount > 0;
    case "posts":
      return f.config.content.showFeed && f.feedCount > 0;
    case "contact":
      return f.config.leadCapture.showForm;
    default:
      return false;
  }
}

/** Pages that exist for this hub, in menu order. */
export function availablePages(f: HubPageFacts): HubPageKey[] {
  return HUB_PAGE_KEYS.filter((k) => pageAvailable(k, f));
}

/**
 * Where a link to a section goes.
 *
 * `pages` layout: the page itself (`/@u/services`), except the assistant,
 * which lives on the home page (`/@u#assistant`).
 * `single` layout: an anchor on the home page (`#services`), with the full
 * path when linking from a subpage such as the home-value funnel.
 */
export function sectionHref(
  username: string,
  key: HubPageKey | "assistant" | "home",
  layout: HubConfig["appearance"]["layout"],
  opts: { fromHome?: boolean } = {},
): string {
  const root = `/@${username}`;
  if (key === "home") return root;
  if (key === "assistant") return opts.fromHome ? "#assistant" : `${root}#assistant`;
  if (layout === "pages") return `${root}/${key}`;
  return opts.fromHome ? `#${key}` : `${root}#${key}`;
}

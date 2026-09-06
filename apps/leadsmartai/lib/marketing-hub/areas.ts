import type { FeedItem } from "./feedItems";

/**
 * Market-area pages: /@handle/area/<slug>.
 *
 * One page per area the agent serves, so "Alhambra real estate agent" has
 * somewhere to land that is about Alhambra and about this agent. The slug is
 * derived from the area name the agent typed, deterministically, so the
 * editor never has to manage a second field and a renamed area simply gets
 * a new address.
 *
 * Pure: names in, slugs and matches out.
 */

export type AreaRef = { name: string; note: string | null };

/** "Monterey Park, CA" → "monterey-park-ca". ASCII only; anything else is dropped. */
export function areaSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The area a slug names, or null. First match wins when two names collide. */
export function findArea(areas: readonly AreaRef[], slug: string): AreaRef | null {
  const wanted = String(slug ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return areas.find((a) => areaSlug(a.name) === wanted) ?? null;
}

/** "Monterey Park, CA" → "Monterey Park" — the part a post would mention. */
export function areaPlaceName(name: string): string {
  return name.split(",")[0]?.trim() || name.trim();
}

/**
 * Posts that mention the area by name, in caption or hashtag. Case-blind,
 * whole-word for short names so "Ely" does not match "Berkeley".
 */
export function postsForArea(feed: readonly FeedItem[], areaName: string, limit = 6): FeedItem[] {
  const place = areaPlaceName(areaName);
  if (!place) return [];
  const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(place.length <= 4 ? `\\b${escaped}\\b` : escaped, "i");
  const compact = place.replace(/\s+/g, "").toLowerCase();
  return feed
    .filter((item) => re.test(item.caption) || item.topics.some((t) => t.toLowerCase() === compact))
    .slice(0, limit);
}

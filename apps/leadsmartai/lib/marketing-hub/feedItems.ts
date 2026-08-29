/**
 * The agent's public content feed — what they have actually published.
 *
 * The hub is not a brochure. An agent who posts every week already produces
 * the only thing that makes a page like this worth visiting twice, and worth
 * indexing at all: real, dated, unique content. Thousands of near-identical
 * agent pages is the doorway-page pattern search engines penalise; a page
 * backed by fifty real posts is not that.
 *
 * Three tables feed it, all agent-scoped already:
 *
 *   scheduled_posts    the cross-platform post queue — the bulk of it
 *   social_carousels   multi-image posts
 *   social_reels       video
 *
 * ONLY PUBLISHED WORK APPEARS. Two reasons, and the second is the important
 * one. A draft on a public page is embarrassing; but `media_library` also
 * holds property photos an agent uploaded for other purposes, and some of
 * those belong to clients who never agreed to a public gallery. Publishing is
 * the consent signal — if it went out to a social network it is already
 * public, and showing it again is safe. Nothing that has not been posted is
 * inferred to be publishable.
 *
 * The status vocabulary is `posted`, NOT `published`. Every one of these
 * tables uses it, and reading `published` returns an empty feed on a page that
 * otherwise looks completely correct — no error, just nothing there.
 *
 * Pure: no I/O, so the merge, filter and ordering can be tested without a
 * database.
 */

/** What a feed entry is, which decides how it renders. */
export type FeedKind = "post" | "carousel" | "reel";

export type FeedItem = {
  id: string;
  kind: FeedKind;
  /** Network it went out on. Null when the row does not record one. */
  platform: string | null;
  /** The words. Trimmed; may be empty for an image-only post. */
  caption: string;
  /** Cover image. Null renders as a text card rather than a broken frame. */
  imageUrl: string | null;
  /** When it went public. ISO. Used for ordering and for the dateline. */
  postedAt: string;
};

/** The one status that means "this is public". */
export const POSTED_STATUS = "posted";

type RawRow = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function firstString(row: RawRow, keys: string[]): string {
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return "";
}

/**
 * When this went public.
 *
 * `published_at` is the truth where a table records it; `created_at` is the
 * fallback. Ordering a feed by created_at alone would put a post drafted in
 * June but published in August in the wrong place entirely.
 */
function postedAt(row: RawRow): string | null {
  const explicit = firstString(row, ["published_at", "posted_at"]);
  if (explicit) return explicit;
  const created = str(row.created_at);
  return created || null;
}

function toItem(row: RawRow, kind: FeedKind): FeedItem | null {
  if (str(row.status) !== POSTED_STATUS) return null;
  const id = str(row.id);
  const when = postedAt(row);
  if (!id || !when) return null;

  return {
    id: `${kind}:${id}`,
    kind,
    platform: str(row.platform) || null,
    caption: firstString(row, ["caption", "title"]),
    imageUrl: firstString(row, ["image_url", "cover_url", "thumbnail_url"]) || null,
    postedAt: when,
  };
}

/**
 * Merge the three sources into one feed, newest first.
 *
 * @param sources raw rows straight from the tables; unknown shapes are
 *   tolerated rather than trusted, because a column added upstream should
 *   never take a public page down.
 * @param limit how many to keep after sorting. Applied last, so the newest
 *   survive regardless of which table they came from.
 */
export function buildFeed(
  sources: {
    posts?: RawRow[] | null;
    carousels?: RawRow[] | null;
    reels?: RawRow[] | null;
  },
  limit = 24,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (const row of sources.posts ?? []) {
    const item = toItem(row, "post");
    if (item) items.push(item);
  }
  for (const row of sources.carousels ?? []) {
    const item = toItem(row, "carousel");
    if (item) items.push(item);
  }
  for (const row of sources.reels ?? []) {
    const item = toItem(row, "reel");
    if (item) items.push(item);
  }

  items.sort((a, b) => {
    const diff = Date.parse(b.postedAt) - Date.parse(a.postedAt);
    // Ties broken by id so the order is stable between renders — an unstable
    // feed makes cached pages and screenshots disagree for no reason.
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  return items.slice(0, Math.max(0, limit));
}

/**
 * A short, plain-language dateline: "3 days ago", "last month".
 *
 * Relative rather than absolute because a hub is judged on whether it looks
 * tended. "2 days ago" says the agent is active; "14 August 2026" makes the
 * reader do arithmetic to find out.
 */
export function postedAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((now - then) / 86_400_000);
  if (days < 0) return "just now";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 61) return "last month";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return days < 730 ? "last year" : `${Math.floor(days / 365)} years ago`;
}

/**
 * Is there enough here to be worth indexing?
 *
 * The thin-content risk is real and it is shared: a penalty earned by a
 * hundred empty agent hubs can drag the rest of the domain down with them. A
 * hub below this bar renders for anyone who has the link but asks search
 * engines to leave it alone.
 */
export const MIN_ITEMS_TO_INDEX = 3;

export function isIndexable(args: {
  published: boolean;
  bio: string | null | undefined;
  feedCount: number;
}): boolean {
  return (
    args.published &&
    str(args.bio).length >= 40 &&
    args.feedCount >= MIN_ITEMS_TO_INDEX
  );
}

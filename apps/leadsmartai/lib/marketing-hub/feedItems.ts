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

import { postMediaKind, type MediaKind } from "./mediaKind";

/** What a feed entry is, which decides how it renders. */
export type FeedKind = "post" | "carousel" | "reel";

/** One network a piece of content went out on, and where to read it there. */
export type FeedLink = {
  platform: string;
  /** Permalink on that network. Null when the publish did not return one. */
  url: string | null;
  postedAt: string;
};

export type FeedItem = {
  id: string;
  kind: FeedKind;
  /** The words. Trimmed; may be empty for an image-only post. */
  caption: string;
  /** Cover media. Null renders as a text card rather than a broken frame. */
  imageUrl: string | null;
  /**
   * Whether `imageUrl` is a still or a video. The column is called image_url
   * and holds both — a rendered reel puts its MP4 there — so a renderer that
   * assumes "image" from the name draws a broken frame over a working video.
   */
  mediaKind: MediaKind;
  /**
   * When this content FIRST went public, across every network it reached.
   * Earliest rather than latest: it answers "when did the agent publish this",
   * and a cross-post finishing a day later should not make old work look new.
   */
  postedAt: string;
  /** Every network it reached. One entry for a single post, several for a cross-post. */
  links: FeedLink[];
  /** The agent's hashtags, lower-cased and without the "#". Drives related content. */
  topics: string[];
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
/**
 * Hashtags → topic strings.
 *
 * Lower-cased without the leading "#" so `#FirstTimeBuyer` and
 * `#firsttimebuyer` are one topic rather than two; otherwise "related" misses
 * the posts it most obviously ought to find. The agent's own ordering is kept
 * as a rough relevance signal.
 */
function toTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const tag = str(entry).replace(/^#+/, "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function postedAt(row: RawRow): string | null {
  const explicit = firstString(row, ["published_at", "posted_at"]);
  if (explicit) return explicit;
  const created = str(row.created_at);
  return created || null;
}

type Draft = {
  id: string;
  kind: FeedKind;
  caption: string;
  imageUrl: string | null;
  mediaKind: MediaKind;
  postedAt: string;
  platform: string;
  url: string | null;
  topics: string[];
};

function toDraft(row: RawRow, kind: FeedKind): Draft | null {
  if (str(row.status) !== POSTED_STATUS) return null;
  const id = str(row.id);
  const when = postedAt(row);
  if (!id || !when) return null;

  return {
    id: `${kind}:${id}`,
    kind,
    caption: firstString(row, ["caption", "title"]),
    imageUrl: firstString(row, ["image_url", "cover_url", "thumbnail_url"]) || null,
    mediaKind: postMediaKind({
      url: firstString(row, ["image_url", "cover_url", "thumbnail_url"]) || null,
      subjectKind: str(row.subject_kind),
    }),
    postedAt: when,
    platform: str(row.platform),
    url: firstString(row, ["external_post_url", "post_url", "permalink"]) || null,
    topics: toTopics(row.hashtags),
  };
}

/**
 * The key that decides whether two rows are the same piece of content.
 *
 * Cross-posting is one act — an agent writes something once and it goes to
 * Threads, Facebook and Instagram. Three rows, one thing said. Rendering them
 * as three cards makes a hub look padded and makes a reader scroll past the
 * same paragraph three times, which is worse than showing less.
 *
 * Keyed on the caption because that is what a reader recognises as "the same
 * post"; the networks each mangle it differently at the edges, so it is
 * normalised first.
 *
 * An EMPTY caption never groups. Image-only posts share the empty string, and
 * keying on it would collapse every one of them into a single card — the one
 * case where grouping destroys content rather than tidying it.
 */
function groupKey(d: Draft): string {
  const words = d.caption.toLowerCase().replace(/\s+/g, " ").trim();
  return words ? `${d.kind}|${words}` : `unique|${d.id}`;
}

/**
 * Merge the three sources into one feed, newest first, one card per piece of
 * content however many networks it reached.
 *
 * @param sources raw rows straight from the tables; unknown shapes are
 *   tolerated rather than trusted, because a column added upstream should
 *   never take a public page down.
 * @param limit how many to keep after grouping and sorting. Applied last, so
 *   the newest survive regardless of which table they came from.
 */
export function buildFeed(
  sources: {
    posts?: RawRow[] | null;
    carousels?: RawRow[] | null;
    reels?: RawRow[] | null;
  },
  limit = 24,
): FeedItem[] {
  const drafts: Draft[] = [];
  const collect = (rows: RawRow[] | null | undefined, kind: FeedKind) => {
    for (const row of rows ?? []) {
      const d = toDraft(row, kind);
      if (d) drafts.push(d);
    }
  };
  collect(sources.posts, "post");
  collect(sources.carousels, "carousel");
  collect(sources.reels, "reel");

  const groups = new Map<string, FeedItem>();
  for (const d of drafts) {
    const key = groupKey(d);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id: d.id,
        kind: d.kind,
        caption: d.caption,
        imageUrl: d.imageUrl,
        mediaKind: d.mediaKind,
        postedAt: d.postedAt,
        links: d.platform ? [{ platform: d.platform, url: d.url, postedAt: d.postedAt }] : [],
        topics: [...d.topics],
      });
      continue;
    }

    if (d.platform) {
      // One link per NETWORK, not per row. The same content can reach the same
      // network twice — a retry, or a scheduler firing twice seconds apart —
      // and "Read it on facebook · Also on facebook" is noise that makes the
      // agent look like they are spamming. The first publication wins, since
      // that is the post their audience actually saw and engaged with; a later
      // duplicate only supplies a URL if the first never got one.
      const already = existing.links.find((l) => l.platform === d.platform);
      if (!already) {
        existing.links.push({ platform: d.platform, url: d.url, postedAt: d.postedAt });
      } else {
        if (!already.url && d.url) already.url = d.url;
        if (Date.parse(d.postedAt) < Date.parse(already.postedAt)) {
          already.postedAt = d.postedAt;
        }
      }
    }
    // Earliest publication wins — see FeedItem.postedAt.
    if (Date.parse(d.postedAt) < Date.parse(existing.postedAt)) {
      existing.postedAt = d.postedAt;
    }
    // Any image beats none: one network may return a cover the others did not.
    if (!existing.imageUrl && d.imageUrl) existing.imageUrl = d.imageUrl;
    // Networks are tagged separately, so one publication may carry a hashtag
    // the others lack. Union them: a topic on any publication is a topic of
    // the content.
    for (const topic of d.topics) {
      if (!existing.topics.includes(topic)) existing.topics.push(topic);
    }
  }

  const items = [...groups.values()];
  for (const item of items) {
    item.links.sort((a, b) => a.platform.localeCompare(b.platform));
  }

  items.sort((a, b) => {
    const diff = Date.parse(b.postedAt) - Date.parse(a.postedAt);
    // Ties broken by id so the order is stable between renders — an unstable
    // feed makes cached pages and screenshots disagree for no reason.
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  return items.slice(0, Math.max(0, limit));
}

/** Every network represented in a feed, for the filter control. */
export function platformsIn(items: FeedItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) for (const link of item.links) seen.add(link.platform);
  return [...seen].sort();
}

export type FeedOrder = "newest" | "oldest";

/**
 * Apply the reader's choices.
 *
 * Filtering keeps a whole card when ANY of its networks match. The content is
 * what the reader is browsing; hiding a cross-post because they picked one of
 * the two networks it went to would be pedantry rather than filtering.
 */
export function applyFeedView(
  items: FeedItem[],
  view: { platform?: string | null; order?: FeedOrder },
): FeedItem[] {
  const platform = (view.platform ?? "").trim();
  const filtered = platform
    ? items.filter((i) => i.links.some((l) => l.platform === platform))
    : items;

  return [...filtered].sort((a, b) => {
    const diff = Date.parse(a.postedAt) - Date.parse(b.postedAt);
    const ordered = view.order === "oldest" ? diff : -diff;
    return ordered !== 0 ? ordered : a.id.localeCompare(b.id);
  });
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

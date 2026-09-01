/**
 * Titles, URLs and related content for the hub's per-post pages.
 *
 * `feedItems.ts` answers "what has this agent published" and groups the
 * cross-posts. This answers the next question — "where do I read it" — with a
 * title, a stable URL, and a way to find the next thing.
 *
 * ONE PAGE PER PIECE OF WRITING, NOT PER PUBLICATION. The slug is built from
 * the same normalised caption `buildFeed` groups on, so every network's copy of
 * one post resolves to the same page. Minting a URL per publication would give
 * one cross-post four near-identical pages, which is the duplicate-content
 * pattern `isIndexable` already exists to keep this domain clear of.
 *
 * Pure — no I/O — so titles, slugs and relatedness are testable without a
 * database.
 */

import type { FeedItem } from "./feedItems";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Longest a derived title may run before it stops reading as a headline. */
const TITLE_MAX = 120;

/**
 * A headline for a post that has no title field.
 *
 * Only `social_carousels` stores a title; posts and reels store a caption whose
 * FIRST LINE is already written as a hook — every posted caption in production
 * contains a line break, and those first lines average 95 characters. So the
 * first line is the title and the rest is the body.
 *
 * Long first lines are cut at a sentence end where there is one and a word
 * boundary otherwise. Cutting mid-word produces a title that looks like a
 * rendering bug rather than an abbreviation.
 */
export function deriveTitle(caption: string): string {
  const firstLine = str(caption).split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return "";
  if (firstLine.length <= TITLE_MAX) return firstLine;

  const window = firstLine.slice(0, TITLE_MAX);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("? "),
    window.lastIndexOf("! "),
  );
  // Only honour a sentence break past the halfway mark; nearer the start it
  // produces a title far shorter than the space available.
  if (sentenceEnd > TITLE_MAX / 2) return window.slice(0, sentenceEnd + 1);

  const wordEnd = window.lastIndexOf(" ");
  return `${(wordEnd > 0 ? window.slice(0, wordEnd) : window).trimEnd()}…`;
}

/** The title the feed and the page show. Image-only posts still need one. */
export function titleOf(item: FeedItem): string {
  return deriveTitle(item.caption) || (item.kind === "reel" ? "Video" : "Post");
}

/**
 * Mirrors `groupKey` in feedItems.ts, so a slug is stable across every
 * publication of one piece of writing. Keep the two in step: if grouping
 * changes and this does not, existing content-page URLs break.
 */
function contentIdentity(item: FeedItem): string {
  const words = item.caption.toLowerCase().replace(/\s+/g, " ").trim();
  return words ? `${item.kind}|${words}` : `unique|${item.id}`;
}

/**
 * A short, stable, URL-safe hash.
 *
 * FNV-1a rather than `node:crypto` so this module stays pure and runs anywhere.
 * It is a lookup key, never a security boundary.
 */
function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 16777619, as shifts-and-adds so this stays exact in a double.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

/** Longest the readable half of a slug may run. */
const SLUG_MAX = 60;

/** `social-consistency-is-the-listing-presentation-1a2b3c` */
export function slugFor(item: FeedItem): string {
  const words = titleOf(item)
    .toLowerCase()
    // Keep letters and digits in ANY script — a Chinese-language post must not
    // slug down to nothing but its hash.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  const key = shortHash(contentIdentity(item));
  // The hash is appended so two posts opening with the same line still get
  // distinct URLs, and so a slug matches back without a lookup table.
  return words ? `${words}-${key}` : key;
}

/** The item a content-page slug refers to, or null. */
export function findBySlug(items: FeedItem[], slug: string): FeedItem | null {
  const wanted = str(slug).split("-").pop() ?? "";
  if (!wanted) return null;
  return items.find((item) => shortHash(contentIdentity(item)) === wanted) ?? null;
}

/**
 * Other content by the same agent worth reading next.
 *
 * Ranked by how many topics it shares, then by recency. Sharing more tags is a
 * stronger claim to relatedness than being newer, and without the tiebreak the
 * same handful of recent posts would trail every page on the site.
 */
export function relatedItems(target: FeedItem, all: FeedItem[], limit = 4): FeedItem[] {
  if (target.topics.length === 0) return [];
  const targetTopics = new Set(target.topics);

  return all
    .filter((item) => item.id !== target.id)
    .map((item) => ({ item, shared: item.topics.filter((t) => targetTopics.has(t)).length }))
    .filter((scored) => scored.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        Date.parse(b.item.postedAt) - Date.parse(a.item.postedAt) ||
        a.item.id.localeCompare(b.item.id),
    )
    .slice(0, Math.max(0, limit))
    .map((scored) => scored.item);
}

/**
 * The caption with what the page already shows removed.
 *
 * Two things would otherwise appear twice. The title IS the caption's first
 * line, so printing the caption whole repeats the headline immediately under
 * itself; and the trailing hashtag block is the same set of tags the Topics
 * chips render. Both are relocated, not lost.
 *
 * The first line is dropped ONLY when the title was taken from it verbatim. A
 * truncated title ("…") or a carousel's own `title` column means those words
 * are not already on the page, and cutting them would silently eat the opening
 * sentence.
 */
export function contentBody(item: FeedItem): string {
  const caption = str(item.caption);
  if (!caption) return "";

  const lines = caption.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const title = titleOf(item).trim();

  let rest: string[];
  if (title && firstLine === title) {
    // The whole first line became the title.
    rest = lines.slice(1);
  } else if (title && !title.endsWith("…") && firstLine.startsWith(title)) {
    // `deriveTitle` cut a long first line at a SENTENCE end, so the title is a
    // verbatim prefix of that line rather than the whole of it. Equality alone
    // missed this and printed the headline again directly beneath itself —
    // which is what a 168-character first line does in production. Drop the
    // part that is already the h1 and keep the sentence that follows it.
    const remainder = firstLine.slice(title.length).trim();
    rest = remainder ? [remainder, ...lines.slice(1)] : lines.slice(1);
  } else {
    // Truncated with an ellipsis, or a carousel's own `title` column: those
    // words are NOT on the page, so keep the line whole.
    rest = lines;
  }

  const trimmed = [...rest];
  if (item.topics.length > 0) {
    while (trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1]?.trim() ?? "";
      if (last === "" || /^(#[^\s#]+)(\s+#[^\s#]+)*$/.test(last)) {
        trimmed.pop();
        continue;
      }
      break;
    }
  }

  return trimmed.join("\n").trim();
}

/**
 * Is one piece of content substantial enough for its own indexed URL?
 *
 * `isIndexable` stops a thin HUB being indexed; this stops a thin PAGE. A
 * one-line post deserves to exist and be shareable, but not to enter the index
 * as a standalone document competing with the hub for the same words.
 */
export const MIN_CHARS_TO_INDEX_CONTENT = 200;

export function isContentIndexable(item: FeedItem): boolean {
  return str(item.caption).length >= MIN_CHARS_TO_INDEX_CONTENT;
}

/**
 * "14 Aug" — an absolute date, for where several publications sit side by side.
 *
 * `postedAgo` is right for a single dateline, but "2 weeks ago · 2 weeks ago"
 * cannot tell two publications apart, which is the reason they are listed.
 */
export function shortDate(iso: string, locale = "en-US"): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

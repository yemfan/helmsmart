/**
 * The brokerage content library — the pure half.
 *
 * Three kinds of item, each the smallest thing an agent can post from:
 *   caption  approved wording (a listing-ad template, a disclosure line,
 *            an open-house blurb) — the agent copies it or opens the
 *            composer with it as the brief
 *   media    a shared image or video by URL (logo lockup, brand video)
 *   link     a page to point at (the brokerage site, a market report)
 * Validation lives here so the server action and a test agree on it.
 */

export type LibraryKind = "caption" | "media" | "link";
export const LIBRARY_KINDS: readonly LibraryKind[] = ["caption", "media", "link"];

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  title: string;
  body: string | null;
  mediaUrl: string | null;
  createdBy: string;
  createdAt: string;
};

export type LibraryInput = { kind: LibraryKind; title: string; body: string | null; mediaUrl: string | null };

export const TITLE_MAX = 120;
/** Instagram's caption limit; the longest any network allows. */
export const BODY_MAX = 2200;
export const LIBRARY_MAX_ITEMS = 500;

export type ParseResult = { ok: true; item: LibraryInput } | { ok: false; field: "kind" | "title" | "body" | "mediaUrl"; reason: "required" | "too_long" | "bad_url" };

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseLibraryInput(raw: { kind?: unknown; title?: unknown; body?: unknown; mediaUrl?: unknown }): ParseResult {
  const kind = String(raw.kind ?? "");
  if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) return { ok: false, field: "kind", reason: "required" };
  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, field: "title", reason: "required" };
  if (title.length > TITLE_MAX) return { ok: false, field: "title", reason: "too_long" };
  const body = String(raw.body ?? "").trim() || null;
  if (body && body.length > BODY_MAX) return { ok: false, field: "body", reason: "too_long" };
  const mediaUrl = String(raw.mediaUrl ?? "").trim() || null;
  if (mediaUrl && !isHttpUrl(mediaUrl)) return { ok: false, field: "mediaUrl", reason: "bad_url" };
  if (kind === "caption" && !body) return { ok: false, field: "body", reason: "required" };
  if (kind !== "caption" && !mediaUrl) return { ok: false, field: "mediaUrl", reason: "required" };
  return { ok: true, item: { kind: kind as LibraryKind, title, body, mediaUrl } };
}

/** Where "Use in a post" sends the agent: the composer with the caption as the brief. */
export function composerHref(item: LibraryItem): string {
  const brief = item.body ?? item.title;
  return `/dashboard/leads/generate/post/new?brief=${encodeURIComponent(brief.slice(0, 1500))}`;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function mediaShape(url: string | null): "image" | "video" | "other" {
  if (!url) return "other";
  if (IMAGE_RE.test(url)) return "image";
  if (VIDEO_RE.test(url)) return "video";
  return "other";
}

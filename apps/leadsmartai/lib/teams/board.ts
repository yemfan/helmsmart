/**
 * The office board — the pure half.
 *
 * The unofficial channel: any member posts, colleagues reply. Five kinds,
 * because a listing and a buyer need are what an office actually trades
 * and deserve their own filter:
 *
 *   listing     "Coming soon: 3/2 in Arcadia, $1.1M — want a buyer before MLS"
 *   buyer_need  "Buyer at $800K, Pasadena, needs a yard"
 *   question    "Anyone used this inspector?"
 *   tip         "The county recorder's new portal is faster"
 *   other       anything
 *
 * Validation, ordering, and the match between a listing and a buyer need
 * live here so the action, the panel and a test agree.
 */

export type BoardKind = "listing" | "buyer_need" | "question" | "tip" | "other";
export const BOARD_KINDS: readonly BoardKind[] = ["listing", "buyer_need", "question", "tip", "other"];

export type BoardReply = { id: string; authorAgentId: string; body: string; createdAt: string };

export type BoardPost = {
  id: string;
  kind: BoardKind;
  title: string;
  body: string | null;
  linkUrl: string | null;
  price: number | null;
  authorAgentId: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  replies: BoardReply[];
};

export const TITLE_MAX = 140;
export const BODY_MAX = 3000;
export const REPLY_MAX = 1000;

export type BoardInput = { kind: BoardKind; title: string; body: string | null; linkUrl: string | null; price: number | null };
export type ParseBoard = { ok: true; input: BoardInput } | { ok: false; field: "kind" | "title" | "body" | "linkUrl" | "price"; reason: "required" | "too_long" | "bad_url" | "range" };

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** "$1,100,000" → 1100000; "" → null. */
export function parsePrice(raw: unknown): number | null | typeof NaN {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : NaN;
}

export function parseBoardInput(raw: Record<string, unknown>): ParseBoard {
  const kind = String(raw.kind ?? "");
  if (!(BOARD_KINDS as readonly string[]).includes(kind)) return { ok: false, field: "kind", reason: "required" };
  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, field: "title", reason: "required" };
  if (title.length > TITLE_MAX) return { ok: false, field: "title", reason: "too_long" };
  const body = String(raw.body ?? "").trim() || null;
  if (body && body.length > BODY_MAX) return { ok: false, field: "body", reason: "too_long" };
  const linkUrl = String(raw.linkUrl ?? "").trim() || null;
  if (linkUrl && !isHttpUrl(linkUrl)) return { ok: false, field: "linkUrl", reason: "bad_url" };
  const price = parsePrice(raw.price);
  if (Number.isNaN(price)) return { ok: false, field: "price", reason: "range" };
  return { ok: true, input: { kind: kind as BoardKind, title, body, linkUrl, price: kind === "listing" || kind === "buyer_need" ? (price as number | null) : null } };
}

export function parseReply(raw: unknown): { ok: true; body: string } | { ok: false; reason: "required" | "too_long" } {
  const body = String(raw ?? "").trim();
  if (!body) return { ok: false, reason: "required" };
  if (body.length > REPLY_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, body };
}

/** Newest first. Replies stay in the order they were written. */
export function orderPosts<T extends { createdAt: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A buyer need and a listing in the same office that could be a deal: the
 * listing's price sits at or under the buyer's budget, and the two share
 * a word of four letters or more (a city, a street, a neighbourhood).
 * Shown as a nudge on the post, never as a claim.
 */
export function possibleMatches(post: BoardPost, others: readonly BoardPost[]): BoardPost[] {
  const counterpart: BoardKind | null = post.kind === "listing" ? "buyer_need" : post.kind === "buyer_need" ? "listing" : null;
  if (!counterpart) return [];
  const words = new Set(tokens(`${post.title} ${post.body ?? ""}`));
  return others.filter((o) => {
    if (o.kind !== counterpart || o.id === post.id) return false;
    const listing = post.kind === "listing" ? post : o;
    const buyer = post.kind === "buyer_need" ? post : o;
    if (listing.price != null && buyer.price != null && listing.price > buyer.price) return false;
    return tokens(`${o.title} ${o.body ?? ""}`).some((w) => words.has(w));
  });
}

const STOP = new Set(["with", "from", "that", "this", "have", "need", "needs", "want", "wants", "home", "house", "bed", "beds", "bath", "baths", "looking", "buyer", "listing", "anyone", "before", "coming", "soon"]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

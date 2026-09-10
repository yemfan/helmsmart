/**
 * The brokerage billboard — the pure half.
 *
 * A billboard beats a group email because it stays where agents already
 * look (the team page and their dashboard), it tells the broker who saw
 * it, and it lets agents answer in one tap. Five kinds a manager posts and
 * one the system posts:
 *
 *   news      "Office closed Monday", "New commission schedule"
 *   win       a shout-out — a closing, a milestone — naming the agent
 *   event     a date: training, open-house tour, the holiday party
 *   reminder  "Q3 disclosures due Friday"
 *   policy    something every agent must read; email it too
 *   welcome   posted by the system when someone joins
 *
 * Pinned posts stay on top; expired posts drop off. Validation, ordering
 * and the email copy live here so the action, the cron and the panel agree.
 */

export type AnnouncementKind = "news" | "win" | "event" | "reminder" | "policy" | "welcome";
export const ANNOUNCEMENT_KINDS: readonly AnnouncementKind[] = ["news", "win", "event", "reminder", "policy"];

export type Reaction = "cheer" | "like" | "heart";
export const REACTIONS: readonly Reaction[] = ["cheer", "like", "heart"];
export const REACTION_GLYPH: Record<Reaction, string> = { cheer: "🎉", like: "👍", heart: "❤️" };

export type Announcement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  linkUrl: string | null;
  shoutoutAgentId: string | null;
  authorAgentId: string | null;
  pinned: boolean;
  expiresAt: string | null;
  emailRequestedAt: string | null;
  createdAt: string;
  /** How many members have opened it. */
  readCount: number;
  reactions: Record<Reaction, number>;
  /** The viewer's own state. */
  mine: { read: boolean; reaction: Reaction | null };
};

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

export type AnnouncementInput = {
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  linkUrl: string | null;
  shoutoutAgentId: string | null;
  pinned: boolean;
  expiresAt: string | null;
  email: boolean;
};

export type ParseAnnouncement = { ok: true; input: AnnouncementInput } | { ok: false; field: "kind" | "title" | "body" | "linkUrl" | "expiresAt"; reason: "required" | "too_long" | "bad_url" | "past" };

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseAnnouncementInput(raw: Record<string, unknown>, now = Date.now()): ParseAnnouncement {
  const kind = String(raw.kind ?? "");
  if (!(ANNOUNCEMENT_KINDS as readonly string[]).includes(kind)) return { ok: false, field: "kind", reason: "required" };
  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, field: "title", reason: "required" };
  if (title.length > TITLE_MAX) return { ok: false, field: "title", reason: "too_long" };
  const body = String(raw.body ?? "").trim() || null;
  if (body && body.length > BODY_MAX) return { ok: false, field: "body", reason: "too_long" };
  const linkUrl = String(raw.linkUrl ?? "").trim() || null;
  if (linkUrl && !isHttpUrl(linkUrl)) return { ok: false, field: "linkUrl", reason: "bad_url" };
  const expiresRaw = String(raw.expiresAt ?? "").trim();
  let expiresAt: string | null = null;
  if (expiresRaw) {
    // A date from the form is the end of that day, in UTC — a reminder "until Friday" is still up on Friday.
    const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw) ? `${expiresRaw}T23:59:59Z` : expiresRaw);
    if (!Number.isFinite(t)) return { ok: false, field: "expiresAt", reason: "past" };
    if (t < now) return { ok: false, field: "expiresAt", reason: "past" };
    expiresAt = new Date(t).toISOString();
  }
  const shoutoutAgentId = String(raw.shoutoutAgentId ?? "").trim() || null;
  return {
    ok: true,
    input: { kind: kind as AnnouncementKind, title, body, linkUrl, shoutoutAgentId: kind === "win" ? shoutoutAgentId : null, pinned: raw.pinned === true || raw.pinned === "true" || raw.pinned === "on", expiresAt, email: raw.email === true || raw.email === "true" || raw.email === "on" },
  };
}

export function isLive(a: { expiresAt: string | null }, now = Date.now()): boolean {
  return !a.expiresAt || Date.parse(a.expiresAt) > now;
}

/** Pinned first, then newest; expired ones are not shown at all. */
export function orderAnnouncements<T extends { pinned: boolean; createdAt: string; expiresAt: string | null }>(list: readonly T[], now = Date.now()): T[] {
  return list.filter((a) => isLive(a, now)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

/** What the dashboard card shows: unread first, pinned next, at most `limit`. */
export function pickForDashboard(list: readonly Announcement[], limit = 3, now = Date.now()): Announcement[] {
  const live = orderAnnouncements(list, now);
  const unread = live.filter((a) => !a.mine.read);
  const rest = live.filter((a) => a.mine.read && a.pinned);
  return [...unread, ...rest].slice(0, limit);
}

export function reachPercent(readCount: number, members: number): number {
  if (members <= 0) return 0;
  return Math.min(100, Math.round((readCount / members) * 100));
}

export function emptyReactions(): Record<Reaction, number> {
  return { cheer: 0, like: 0, heart: 0 };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The email a post goes out as, when the manager asked for one. */
export function announcementEmail(a: { kind: AnnouncementKind; title: string; body: string | null; linkUrl: string | null }, ctx: { first: string | null; brokerage: string; author: string | null; origin: string }): { subject: string; text: string; html: string } {
  const teamUrl = `${ctx.origin}/dashboard/team#billboard`;
  const subject = `${ctx.brokerage}: ${a.title}`;
  const hi = ctx.first ? `Hi ${ctx.first},` : "Hi,";
  const from = ctx.author ? `${ctx.author}, ${ctx.brokerage}` : ctx.brokerage;
  const text = [hi, "", a.title, "", ...(a.body ? [a.body, ""] : []), ...(a.linkUrl ? [a.linkUrl, ""] : []), `Posted on the ${ctx.brokerage} billboard: ${teamUrl}`, "", from].join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
      <p>${esc(hi)}</p>
      <p style="font-size:17px;font-weight:600">${esc(a.title)}</p>
      ${a.body ? `<p style="white-space:pre-wrap">${esc(a.body)}</p>` : ""}
      ${a.linkUrl ? `<p><a href="${esc(a.linkUrl)}">${esc(a.linkUrl)}</a></p>` : ""}
      <p style="margin:24px 0"><a href="${teamUrl}" style="background:#0072ce;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open the billboard</a></p>
      <p style="color:#475569;font-size:13px">${esc(from)}</p>
    </div>`;
  return { subject, text, html };
}

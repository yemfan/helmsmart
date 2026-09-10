import { describe, expect, it } from "vitest";
import { announcementEmail, emptyReactions, orderAnnouncements, parseAnnouncementInput, pickForDashboard, reachPercent, type Announcement } from "../billboard";

const NOW = Date.parse("2026-09-10T12:00:00Z");

const post = (over: Partial<Announcement>): Announcement => ({
  id: "1",
  kind: "news",
  title: "T",
  body: null,
  linkUrl: null,
  shoutoutAgentId: null,
  authorAgentId: "a",
  pinned: false,
  expiresAt: null,
  emailRequestedAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  readCount: 0,
  reactions: emptyReactions(),
  mine: { read: false, reaction: null },
  ...over,
});

describe("parseAnnouncementInput", () => {
  it("accepts a post, reads checkbox strings, and keeps the shout-out only on a win", () => {
    const r = parseAnnouncementInput({ kind: "win", title: " Big closing ", body: " Ann closed 12 Main ", linkUrl: "", pinned: "on", email: "true", shoutoutAgentId: "42", expiresAt: "2026-09-30" }, NOW);
    expect(r).toEqual({ ok: true, input: { kind: "win", title: "Big closing", body: "Ann closed 12 Main", linkUrl: null, shoutoutAgentId: "42", pinned: true, expiresAt: "2026-09-30T23:59:59.000Z", email: true } });
    const n = parseAnnouncementInput({ kind: "news", title: "x", shoutoutAgentId: "42" }, NOW);
    expect(n.ok && n.input.shoutoutAgentId).toBeNull();
  });

  it("refuses a system kind, an empty title, a bad link and a date already gone", () => {
    expect(parseAnnouncementInput({ kind: "welcome", title: "x" }, NOW)).toEqual({ ok: false, field: "kind", reason: "required" });
    expect(parseAnnouncementInput({ kind: "news", title: "  " }, NOW)).toEqual({ ok: false, field: "title", reason: "required" });
    expect(parseAnnouncementInput({ kind: "news", title: "x", linkUrl: "ftp://x" }, NOW)).toEqual({ ok: false, field: "linkUrl", reason: "bad_url" });
    expect(parseAnnouncementInput({ kind: "news", title: "x", expiresAt: "2026-09-01" }, NOW)).toEqual({ ok: false, field: "expiresAt", reason: "past" });
  });
});

describe("ordering", () => {
  it("pins first, newest next, and drops what expired", () => {
    const list = [post({ id: "old" }), post({ id: "pinned", pinned: true, createdAt: "2026-08-01T00:00:00Z" }), post({ id: "new", createdAt: "2026-09-09T00:00:00Z" }), post({ id: "gone", expiresAt: "2026-09-09T00:00:00Z" })];
    expect(orderAnnouncements(list, NOW).map((a) => a.id)).toEqual(["pinned", "new", "old"]);
  });

  it("gives the dashboard the unread ones, then pinned, capped", () => {
    const list = [post({ id: "read-pinned", pinned: true, mine: { read: true, reaction: null } }), post({ id: "read", mine: { read: true, reaction: null } }), post({ id: "u1", createdAt: "2026-09-05T00:00:00Z" }), post({ id: "u2", createdAt: "2026-09-06T00:00:00Z" })];
    expect(pickForDashboard(list, 3, NOW).map((a) => a.id)).toEqual(["u2", "u1", "read-pinned"]);
    expect(pickForDashboard(list, 1, NOW).map((a) => a.id)).toEqual(["u2"]);
  });
});

describe("reach and email", () => {
  it("rounds reach and never passes 100", () => {
    expect(reachPercent(812, 1200)).toBe(68);
    expect(reachPercent(5, 0)).toBe(0);
    expect(reachPercent(7, 5)).toBe(100);
  });

  it("writes the email with the title, the body, the link and the billboard button", () => {
    const m = announcementEmail({ kind: "policy", title: "New disclosure form", body: "Use the <new> form from Monday.", linkUrl: "https://x.test/form" }, { first: "Ann", brokerage: "MAXY & Co", author: "Bob", origin: "https://www.closebossai.com" });
    expect(m.subject).toBe("MAXY & Co: New disclosure form");
    expect(m.text).toContain("Hi Ann,");
    expect(m.text).toContain("https://x.test/form");
    expect(m.text).toContain("https://www.closebossai.com/dashboard/team#billboard");
    expect(m.text.trimEnd().endsWith("Bob, MAXY & Co")).toBe(true);
    expect(m.html).toContain("Use the &lt;new&gt; form");
    expect(m.html).toContain("MAXY &amp; Co");
  });
});

import { describe, expect, it } from "vitest";

import {
  SESSION_IDLE_MS,
  isWellFormedId,
  journeyHeadline,
  readCookieFromHeader,
  resolveVisitor,
  summariseJourney,
  touchSession,
} from "@/lib/marketing-hub/visitor";

const NOW = Date.parse("2026-08-29T12:00:00Z");
/** Deterministic stand-in for crypto.randomUUID(). */
function seq() {
  let n = 0;
  return () => `abcdef0123456789abcdef${String(n++).padStart(2, "0")}`;
}

describe("readCookieFromHeader", () => {
  it("finds a cookie that is not the first one", () => {
    // The bug this replaced used `\s` inside a template literal, which
    // collapses to a plain "s" — so it matched only at the very start of the
    // header. The stitch then worked or not depending on cookie ORDER.
    expect(readCookieFromHeader("other=1; cb_vid=abc123", "cb_vid")).toBe("abc123");
    expect(readCookieFromHeader("a=1; b=2; cb_vid=xyz; c=3", "cb_vid")).toBe("xyz");
  });

  it("finds a cookie that IS the first one", () => {
    expect(readCookieFromHeader("cb_vid=abc123; other=1", "cb_vid")).toBe("abc123");
  });

  it("does not match a cookie whose name merely ends with the one asked for", () => {
    expect(readCookieFromHeader("not_cb_vid=nope", "cb_vid")).toBeNull();
    expect(readCookieFromHeader("xcb_vid=nope; cb_vid=yes", "cb_vid")).toBe("yes");
  });

  it("decodes percent-escapes and tolerates a broken one", () => {
    expect(readCookieFromHeader("cb_vid=a%2Eb", "cb_vid")).toBe("a.b");
    expect(readCookieFromHeader("cb_vid=%E0%A4%A", "cb_vid")).toBeNull();
  });

  it("returns null for missing, empty and malformed headers", () => {
    expect(readCookieFromHeader(null, "cb_vid")).toBeNull();
    expect(readCookieFromHeader("", "cb_vid")).toBeNull();
    expect(readCookieFromHeader("garbage", "cb_vid")).toBeNull();
    expect(readCookieFromHeader("cb_vid=abc", "")).toBeNull();
  });
});

describe("isWellFormedId", () => {
  it("accepts what we issue", () => {
    expect(isWellFormedId("abcdef0123456789")).toBe(true);
    expect(isWellFormedId("abcdef0123456789.1756468800000")).toBe(true);
  });

  it("rejects a hand-edited cookie rather than passing it to a query", () => {
    expect(isWellFormedId("' or 1=1--")).toBe(false);
    expect(isWellFormedId("short")).toBe(false);
    expect(isWellFormedId("a".repeat(80))).toBe(false);
    expect(isWellFormedId(null)).toBe(false);
    expect(isWellFormedId("")).toBe(false);
  });
});

describe("resolveVisitor", () => {
  it("mints both ids for a first-time visitor", () => {
    const ids = resolveVisitor({}, seq(), NOW);
    expect(ids.isNewVisitor).toBe(true);
    expect(ids.isNewSession).toBe(true);
    expect(ids.visitorId).toBeTruthy();
    expect(ids.sessionId).toContain(String(NOW));
  });

  it("keeps the visitor id across visits — the whole point", () => {
    const first = resolveVisitor({}, seq(), NOW);
    const later = resolveVisitor(
      { visitorId: first.visitorId, sessionId: first.sessionId },
      seq(),
      NOW + 60_000,
    );
    expect(later.visitorId).toBe(first.visitorId);
    expect(later.isNewVisitor).toBe(false);
  });

  it("continues a session that is still warm, and refreshes its stamp", () => {
    const first = resolveVisitor({}, seq(), NOW);
    const soon = resolveVisitor(
      { visitorId: first.visitorId, sessionId: first.sessionId },
      seq(),
      NOW + SESSION_IDLE_MS - 1000,
    );
    expect(soon.isNewSession).toBe(false);
    expect(soon.sessionId).not.toBe(first.sessionId); // stamp moved
    expect(soon.sessionId.split(".")[0]).toBe(first.sessionId.split(".")[0]); // identity kept
  });

  it("starts a new session after the idle window, same visitor", () => {
    const first = resolveVisitor({}, seq(), NOW);
    const later = resolveVisitor(
      { visitorId: first.visitorId, sessionId: first.sessionId },
      seq(),
      NOW + SESSION_IDLE_MS + 1,
    );
    expect(later.isNewSession).toBe(true);
    expect(later.isNewVisitor).toBe(false);
    expect(later.visitorId).toBe(first.visitorId);
  });

  it("treats a tampered cookie as absent rather than trusting it", () => {
    const ids = resolveVisitor({ visitorId: "'; drop table--", sessionId: "x" }, seq(), NOW);
    expect(ids.isNewVisitor).toBe(true);
    expect(ids.visitorId).not.toContain("drop");
  });

  it("does not collapse every visitor onto one id when randomness fails", () => {
    // A generator returning junk must not produce a shared constant — that
    // would merge every stranger's journey into a single contact.
    const a = resolveVisitor({}, () => "", NOW);
    const b = resolveVisitor({}, () => "!!!", NOW);
    expect(a.visitorId.length).toBeGreaterThanOrEqual(8);
    expect(b.visitorId.length).toBeGreaterThanOrEqual(8);
  });
});

describe("touchSession", () => {
  it("replaces the stamp without changing identity", () => {
    expect(touchSession("abc123.111", 222)).toBe("abc123.222");
    expect(touchSession("abc123", 222)).toBe("abc123.222");
  });
});

describe("summariseJourney", () => {
  const rows = [
    { event_type: "page_view", page_path: "/@michaelye", source: "facebook", campaign: "aug", session_id: "s1", created_at: "2026-08-01T10:00:00Z" },
    { event_type: "page_view", page_path: "/@michaelye", source: null, campaign: null, session_id: "s1", created_at: "2026-08-01T10:05:00Z" },
    { event_type: "page_view", page_path: "/@michaelye", source: null, campaign: null, session_id: "s2", created_at: "2026-08-20T09:00:00Z" },
    { event_type: "conversion", page_path: "/@michaelye", source: null, campaign: null, session_id: "s2", created_at: "2026-08-20T09:10:00Z" },
  ];

  it("counts the pages read BEFORE the enquiry", () => {
    expect(summariseJourney(rows).viewsBeforeConverting).toBe(3);
  });

  it("counts distinct sessions as visits", () => {
    expect(summariseJourney(rows).visits).toBe(2);
  });

  it("credits FIRST touch, not last", () => {
    // By the time they fill the form they typed the name they already knew.
    // Crediting "direct" would hide the Facebook post that did the work.
    const j = summariseJourney(rows);
    expect(j.firstSource).toBe("facebook");
    expect(j.firstCampaign).toBe("aug");
  });

  it("orders events oldest first regardless of how they arrived", () => {
    const shuffled = [rows[3], rows[0], rows[2], rows[1]];
    expect(summariseJourney(shuffled).events.map((e) => e.createdAt)).toEqual(
      rows.map((r) => r.created_at),
    );
  });

  it("handles a visitor who has not converted", () => {
    const j = summariseJourney(rows.slice(0, 2));
    expect(j.convertedAt).toBeNull();
    expect(j.viewsBeforeConverting).toBe(2);
  });

  it("counts one visit for rows that predate session tracking", () => {
    const j = summariseJourney([
      { event_type: "page_view", created_at: "2026-07-01T00:00:00Z" },
    ]);
    expect(j.visits).toBe(1);
  });

  it("survives empty and malformed input", () => {
    expect(summariseJourney([]).visits).toBe(0);
    expect(summariseJourney([{ event_type: "", created_at: "" }]).events).toEqual([]);
  });
});

describe("journeyHeadline", () => {
  it("says the thing an agent reacts to", () => {
    const j = summariseJourney([
      { event_type: "page_view", source: "facebook", session_id: "s1", created_at: "2026-08-01T10:00:00Z" },
      { event_type: "page_view", session_id: "s2", created_at: "2026-08-05T10:00:00Z" },
      { event_type: "conversion", session_id: "s2", created_at: "2026-08-05T10:10:00Z" },
    ]);
    expect(journeyHeadline(j)).toBe(
      "Read 2 pages across 2 visits before getting in touch · first found you via facebook",
    );
  });

  it("says nothing rather than reporting a gap as a fact", () => {
    // "0 pages from unknown" reads as a fact about the person, not about what
    // we failed to record.
    expect(journeyHeadline(summariseJourney([]))).toBe("");
  });

  it("uses the singular for one page and drops the visit clause for one visit", () => {
    const j = summariseJourney([
      { event_type: "page_view", source: "google", session_id: "s1", created_at: "2026-08-01T10:00:00Z" },
      { event_type: "conversion", session_id: "s1", created_at: "2026-08-01T10:05:00Z" },
    ]);
    expect(journeyHeadline(j)).toBe(
      "Read 1 page before getting in touch · first found you via google",
    );
  });
});

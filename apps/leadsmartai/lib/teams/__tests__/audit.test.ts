import { describe, expect, it } from "vitest";
import { auditCaption, buildAuditReport, type AuditPost } from "../audit";

const post = (caption: string, over: Partial<AuditPost> = {}): AuditPost => ({ id: "p1", agentId: "a", platform: "meta", caption, url: null, publishedAt: "2026-09-01T00:00:00Z", ...over });
const ctx = { brokerageName: "MAXY Realty Group", license: "DRE #02123456" };
const none = { brokerageName: null, license: null };

describe("auditCaption", () => {
  it("circles fair-housing wording with the words themselves", () => {
    const f = auditCaption(post("Cozy 2BR, adults only, near the church. Call me!"), none);
    expect(f.map((x) => x.kind)).toEqual(["fair_housing"]);
    expect(f[0]!.quote).toContain("adults only");
    expect(f[0]!.severity).toBe("high");
  });

  it("leaves ordinary listing language alone", () => {
    expect(auditCaption(post("Single-family home with adult education center nearby, sold at list. Open house Sunday 1-4."), none)).toEqual([]);
    expect(auditCaption(post("Just listed in Arcadia — 4 bed, 3 bath, pool. DM for a tour."), none)).toEqual([]);
  });

  it("names outcome promises and unsupported claims separately", () => {
    const f = auditCaption(post("Guaranteed sale in 30 days or I buy it. #1 agent in Pasadena, lowest commission around."), none);
    expect(f.map((x) => x.kind)).toEqual(["outcome_promise", "unsupported_claim"]);
    expect(f[0]!.quote).toContain("Guaranteed");
    expect(f[1]!.quote).toContain("#1 agent");
  });

  it("asks for the brokerage only on ad-length posts, and either the name or the license satisfies it", () => {
    const long = "Just listed: 123 Main St, a 3-bed craftsman with a new roof, updated kitchen and a big yard. Open Saturday and Sunday from 1 to 4. Message me for details.";
    expect(auditCaption(post(long), ctx).map((x) => x.kind)).toEqual(["missing_brokerage"]);
    expect(auditCaption(post(`${long} MAXY Realty Group`), ctx)).toEqual([]);
    expect(auditCaption(post(`${long} dre #02123456`), ctx)).toEqual([]);
    expect(auditCaption(post("Open house Sunday!"), ctx)).toEqual([]);
    expect(auditCaption(post(long), none)).toEqual([]);
  });
});

describe("buildAuditReport", () => {
  it("counts posts, kinds and agents, folds in review flags, and puts the worst first", () => {
    const r = buildAuditReport(
      [
        post("Open house Sunday!", { id: "p1", agentId: "a" }),
        post("No kids please. Great for professionals.", { id: "p2", agentId: "b", publishedAt: "2026-09-02T00:00:00Z" }),
        post("Best team in town.", { id: "p3", agentId: "b", publishedAt: "2026-09-03T00:00:00Z" }),
      ],
      [{ postId: "p4", agentId: "c", platform: "tiktok", url: null, publishedAt: "2026-09-04T00:00:00Z", issue: "asserts an unsupported metric" }],
      none,
    );
    expect(r.postsReviewed).toBe(3);
    expect(r.postsFlagged).toBe(3);
    expect(r.agentsFlagged).toBe(2);
    expect(r.byKind).toEqual({ fair_housing: 1, unsupported_claim: 1, flagged_by_review: 1 });
    expect(r.findings.map((f) => [f.postId, f.kind])).toEqual([
      ["p2", "fair_housing"],
      ["p4", "flagged_by_review"],
      ["p3", "unsupported_claim"],
    ]);
  });
});

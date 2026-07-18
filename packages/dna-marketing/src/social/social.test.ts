import { describe, expect, it } from "vitest";

import {
  buildClaimReviewPrompt,
  canPublish,
  combineClaimReviews,
  isPublishMode,
  modePublishesUnread,
  modeQueuesPosts,
  normalizePostsPerPeriod,
  outcomeForDuePost,
  parseClaimReview,
  queueStatusForMode,
  screenClaims,
  spreadPublishTime,
  SOCIAL_PLATFORMS,
  type ClaimReview,
  type SocialPlatform,
} from "./index";

const WEEK = "2026-07-20"; // a Monday
const MON = new Date("2026-07-20T14:00:00Z");

describe("publish modes — the approval gate", () => {
  it("only 'auto' is publishable from the mode alone", () => {
    // The entire gate rests on this. The publish worker claims only the
    // publishable status, so if any other mode ever returns it, posts go out
    // that nobody read.
    expect(queueStatusForMode("auto")).toBe("publishable");
    for (const m of ["draft", "review", "assisted"] as const) {
      expect(queueStatusForMode(m)).not.toBe("publishable");
    }
  });

  it("'assisted' is held by the mode — its real status comes from the verdict", () => {
    expect(queueStatusForMode("assisted")).toBe("awaiting_approval");
  });

  it("everything except draft plans a period", () => {
    expect(modeQueuesPosts("draft")).toBe(false);
    for (const m of ["review", "assisted", "auto"] as const) {
      expect(modeQueuesPosts(m)).toBe(true);
    }
  });

  it("names 'auto' as the only mode that publishes unread", () => {
    expect(modePublishesUnread("auto")).toBe(true);
    for (const m of ["draft", "review", "assisted"] as const) {
      expect(modePublishesUnread(m)).toBe(false);
    }
  });

  it("rejects unknown modes so a bad request can't widen the gate", () => {
    for (const v of ["autopilot", "AUTO", "", null, undefined, 1, {}]) {
      expect(isPublishMode(v)).toBe(false);
    }
  });
});

describe("cadence spread", () => {
  it("spreads instead of firing a whole period at once", () => {
    const days = [0, 1, 2].map((i) =>
      spreadPublishTime(WEEK, i, { postsPerPeriod: 3, now: MON }),
    );
    expect(days).toEqual([
      "2026-07-20T16:00:00.000Z",
      "2026-07-22T16:00:00.000Z",
      "2026-07-24T16:00:00.000Z",
    ]);
    // The original bug: identical timestamps drained the week on one tick.
    expect(new Set(days).size).toBe(3);
  });

  it("gives one slot per day at every cadence 1-7, never past the period", () => {
    for (let n = 1; n <= 7; n++) {
      const offsets = Array.from({ length: n }, (_, i) =>
        Number(spreadPublishTime(WEEK, i, { postsPerPeriod: n, now: MON }).slice(8, 10)) - 20,
      );
      expect(new Set(offsets).size).toBe(n);
      expect(Math.max(...offsets)).toBeLessThanOrEqual(6);
      expect(Math.min(...offsets)).toBe(0);
    }
  });

  it("rolls past the cadence into the next period rather than piling up", () => {
    expect(spreadPublishTime(WEEK, 3, { postsPerPeriod: 3, now: MON })).toBe(
      "2026-07-27T16:00:00.000Z",
    );
  });

  it("never returns a time in the past", () => {
    const now = new Date("2026-07-24T20:00:00Z");
    for (const i of [0, 1, 2, 3]) {
      expect(
        new Date(spreadPublishTime(WEEK, i, { postsPerPeriod: 7, now })).getTime(),
      ).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it("falls back to the default on a nonsense cadence", () => {
    expect(normalizePostsPerPeriod(0)).toBe(3);
    expect(normalizePostsPerPeriod(99)).toBe(3);
    expect(normalizePostsPerPeriod(null)).toBe(3);
    expect(normalizePostsPerPeriod(5)).toBe(5);
  });
});

describe("platform capability", () => {
  const PUBLISHABLE: SocialPlatform[] = ["linkedin"];

  it("every platform reaches a terminal outcome — none can stay queued", () => {
    // The contract that removes the silent stall: there is no third option.
    for (const p of SOCIAL_PLATFORMS) {
      const outcome = outcomeForDuePost(p, PUBLISHABLE);
      expect(["attempt", "fail"]).toContain(outcome.action);
    }
  });

  it("fails the platforms without a publisher, with a reason", () => {
    for (const p of ["x", "facebook", "instagram"] as const) {
      expect(canPublish(p, PUBLISHABLE)).toBe(false);
      const outcome = outcomeForDuePost(p, PUBLISHABLE);
      expect(outcome.action).toBe("fail");
      if (outcome.action === "fail") {
        expect(outcome.reason).toContain("LinkedIn"); // says what DOES work
        expect(outcome.reason.toLowerCase()).toMatch(/manual|copy/);
      }
    }
  });

  it("rejects unknown platforms rather than assuming they work", () => {
    for (const p of ["", "tiktok", "LinkedIn"]) {
      expect(canPublish(p, PUBLISHABLE)).toBe(false);
    }
  });
});

describe("claim screen (deterministic half)", () => {
  const CFG = {
    forbiddenNames: /\b(follow ?up ?boss|kvcore|re\/max)\b/i,
    sanctionedNumbers: ["59", "24"],
  };

  it("passes honest copy", () => {
    expect(
      screenClaims("Our receptionist answers every call 24/7 and texts back.", CFG),
    ).toBeNull();
    expect(screenClaims("We made our 59-skill library free.", CFG)).toBeNull();
  });

  it("catches the real fabrications that reached production", () => {
    // Both of these are verbatim from AI-written posts that shipped.
    expect(
      screenClaims("every buyer has a live search running on their behalf", CFG),
    ).toMatch(/automation/i);
    expect(
      screenClaims("A lead captured by the receptionist moves directly into the sales cadence.", CFG),
    ).toMatch(/integration/i);
  });

  it("catches invented metrics, pricing, guarantees and competitor names", () => {
    expect(screenClaims("Agents close 3x more deals.", CFG)).toMatch(/metric/i);
    expect(screenClaims("Save 10 hours a week.", CFG)).toMatch(/metric/i);
    expect(screenClaims("Just $99 per month.", CFG)).toMatch(/pricing/i);
    expect(screenClaims("You will close more deals, guaranteed.", CFG)).toMatch(/outcome/i);
    expect(screenClaims("Switching from Follow Up Boss?", CFG)).toMatch(/brand/i);
  });

  it("treats competitor names as config, not core", () => {
    // The same text is fine for a vertical where that name means nothing.
    expect(screenClaims("Switching from Follow Up Boss?", {})).toBeNull();
  });
});

describe("claim review (AI half)", () => {
  const FACTS = { capabilities: "- answers calls", notTrue: "- reads minds" };

  it("puts the facts in the prompt and the copy in the user turn", () => {
    const { system, user } = buildClaimReviewPrompt("Some post.", FACTS);
    expect(system).toContain("- answers calls");
    expect(system).toContain("- reads minds");
    expect(user).toContain("Some post.");
  });

  it("tells the model to judge news differently", () => {
    const product = buildClaimReviewPrompt("x", FACTS, "product").user;
    const news = buildClaimReviewPrompt("x", FACTS, "news").user;
    expect(product).not.toMatch(/cited/i);
    expect(news).toMatch(/cited/i);
    // A cited figure must not read as an invented one.
    expect(news.toLowerCase()).toContain("not violations");
  });

  it("parses a clean verdict", () => {
    const r = parseClaimReview('```json\n{"verdict":"clean","issues":[]}\n```');
    expect(r.verdict).toBe("clean");
  });

  it("fails closed on unparseable output", () => {
    expect(parseClaimReview("the model rambled").verdict).toBe("flagged");
    expect(parseClaimReview("").verdict).toBe("flagged");
  });

  it("fails closed when the model contradicts itself", () => {
    // "clean" while listing problems is not a pass.
    const r = parseClaimReview(
      '```json\n{"verdict":"clean","issues":[{"quote":"a","why":"b"}]}\n```',
    );
    expect(r.verdict).toBe("flagged");
  });

  it("fails closed on a missing or unexpected verdict", () => {
    expect(parseClaimReview('```json\n{"issues":[]}\n```').error).toMatch(/missing/i);
    expect(parseClaimReview('```json\n{"verdict":"maybe"}\n```').verdict).toBe("flagged");
  });

  describe("combining reads — any veto wins", () => {
    const clean: ClaimReview = { verdict: "clean", issues: [] };
    const flagged: ClaimReview = {
      verdict: "flagged",
      issues: [{ quote: "portal leads", why: "no such integration" }],
    };

    it("is clean only when every read is clean", () => {
      expect(combineClaimReviews([clean, clean, clean]).verdict).toBe("clean");
    });

    it("holds the post if ANY read objects", () => {
      // This is the fix for a measured ~3% per-read miss rate.
      expect(combineClaimReviews([clean, clean, flagged]).verdict).toBe("flagged");
      expect(combineClaimReviews([flagged, clean, clean]).verdict).toBe("flagged");
    });

    it("dedupes near-identical objections across reads", () => {
      const combined = combineClaimReviews([flagged, flagged, flagged]);
      expect(combined.issues).toHaveLength(1);
    });

    it("treats zero reads as a failed check, not a pass", () => {
      const r = combineClaimReviews([]);
      expect(r.verdict).toBe("flagged");
      expect(r.error).toBeTruthy();
    });

    it("reports a checker outage distinctly from a real objection", () => {
      const outage: ClaimReview = { verdict: "flagged", issues: [], error: "api down" };
      expect(combineClaimReviews([outage, outage]).error).toBe("api down");
      // A genuine objection alongside an outage is a real finding, not an outage.
      expect(combineClaimReviews([outage, flagged]).error).toBeUndefined();
    });
  });
});

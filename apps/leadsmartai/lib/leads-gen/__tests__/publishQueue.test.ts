import { describe, expect, it } from "vitest";

import {
  DRAIN_BUDGET_MS,
  MAX_ATTEMPTS,
  MAX_REVIVE_AGE_MS,
  STALE_POSTING_MS,
  nextRetryDelay,
  outOfDrainBudget,
  reapDecision,
} from "../publishQueue";

const NOW = Date.parse("2026-08-29T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

/** A row the cron claimed `claimedMinAgo` minutes ago for a just-due post. */
function stuckRow(claimedMinAgo: number, overrides: Record<string, unknown> = {}) {
  const claimedAt = NOW - claimedMinAgo * 60_000;
  return {
    id: "row-1",
    attempt_count: 1,
    scheduled_for: iso(claimedAt),
    updated_at: iso(claimedAt),
    ...overrides,
  };
}

describe("reapDecision", () => {
  it("leaves a freshly claimed row alone so a live run isn't double-posted", () => {
    expect(reapDecision(stuckRow(1), NOW)).toEqual({ action: "leave" });
    // Right up to the threshold it is still someone else's row.
    expect(reapDecision(stuckRow(STALE_POSTING_MS / 60_000 - 1), NOW)).toEqual({
      action: "leave",
    });
  });

  it("requeues the exact shape that stranded 10 posts: 'posting', no error, no retry time", () => {
    // The real rows: claimed within ~30s of creation on 2026-08-25, then never
    // touched again — last_error null, published_at null, next_attempt_at null.
    // Neither the 'scheduled' queue nor the `next_attempt_at <= now()` retry
    // queue can see them.
    const decision = reapDecision(stuckRow(20), NOW);
    expect(decision).toEqual({ action: "requeue" });
  });

  it("fails instead of reviving once the retries are spent", () => {
    const decision = reapDecision(stuckRow(20, { attempt_count: MAX_ATTEMPTS }), NOW);
    expect(decision.action).toBe("fail");
    expect(decision.action === "fail" && decision.reason).toMatch(/interrupted/i);
  });

  it("fails rather than silently publishing day-old content late", () => {
    const decision = reapDecision(
      stuckRow(20, { scheduled_for: iso(NOW - MAX_REVIVE_AGE_MS - 60_000) }),
      NOW,
    );
    expect(decision.action).toBe("fail");
    // Visibly failed is the deliverable: a stuck row shows the agent nothing.
    expect(decision.action === "fail" && decision.reason).toMatch(/reschedule/i);
  });

  it("still revives a post that is stale but inside the window", () => {
    expect(
      reapDecision(stuckRow(20, { scheduled_for: iso(NOW - MAX_REVIVE_AGE_MS + 60_000) }), NOW),
    ).toEqual({ action: "requeue" });
  });

  it("leaves a row with an unreadable claim time rather than guessing", () => {
    expect(reapDecision(stuckRow(20, { updated_at: null }), NOW)).toEqual({ action: "leave" });
  });

  it("treats a null attempt_count as a first attempt, not an exhausted one", () => {
    expect(reapDecision(stuckRow(20, { attempt_count: null }), NOW)).toEqual({
      action: "requeue",
    });
  });
});

describe("nextRetryDelay", () => {
  it("backs off 5min then 30min, then gives up", () => {
    expect(nextRetryDelay(1)).toBe(5 * 60 * 1000);
    expect(nextRetryDelay(2)).toBe(30 * 60 * 1000);
    expect(nextRetryDelay(MAX_ATTEMPTS)).toBeNull();
  });
});

describe("outOfDrainBudget", () => {
  it("keeps publishing while there is time left", () => {
    expect(outOfDrainBudget(NOW, NOW)).toBe(false);
    expect(outOfDrainBudget(NOW, NOW + DRAIN_BUDGET_MS - 1)).toBe(false);
  });

  it("stops the loop before the function is killed mid-publish", () => {
    expect(outOfDrainBudget(NOW, NOW + DRAIN_BUDGET_MS)).toBe(true);
  });

  it("leaves headroom under the route's 300s maxDuration", () => {
    expect(DRAIN_BUDGET_MS).toBeLessThan(300 * 1000);
  });
});

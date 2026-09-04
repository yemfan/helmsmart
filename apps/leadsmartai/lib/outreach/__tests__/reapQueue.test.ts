import { describe, expect, it } from "vitest";

import {
  DRAIN_BUDGET_MS,
  STALE_SENDING_MS,
  describeInterruption,
  outOfDrainBudget,
  outreachReapDecision,
} from "../reapQueue";

/**
 * Recovering outreach batches stranded mid-send.
 *
 * This rail carries phone calls, texts and email to real contacts. Two things
 * can go wrong and they pull in opposite directions: leaving a dead batch
 * claimed for ever (the agent's scheduled outreach silently never happens), or
 * retrying one that already got halfway (a client is called twice under the
 * agent's own name). The second is worse, which is why nothing here requeues.
 */
describe("outreachReapDecision", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");
  const agoMs = (ms: number) => new Date(now - ms).toISOString();

  it("leaves a batch that may still be sending", () => {
    // Reaping a live batch would record delivered outreach as failed.
    expect(
      outreachReapDecision({ id: "a", claimed_at: agoMs(60_000), result: null }, now),
    ).toEqual({ action: "leave" });
  });

  it("fails at the threshold, leaves anything younger", () => {
    // The boundary is `age < threshold => leave`, matching publishQueue's
    // reaper. A batch AT 45 minutes is already six times the route's own
    // ceiling, so the exact millisecond carries no safety either way; being
    // consistent with the other reaper does.
    expect(
      outreachReapDecision({ id: "a", claimed_at: agoMs(STALE_SENDING_MS - 1), result: null }, now).action,
    ).toBe("leave");
    expect(
      outreachReapDecision({ id: "a", claimed_at: agoMs(STALE_SENDING_MS), result: null }, now).action,
    ).toBe("fail");
  });

  it("leaves a row with no usable timestamp rather than guessing", () => {
    // Don't strand it either — the next write gives it one.
    expect(outreachReapDecision({ id: "a", claimed_at: null, result: null }, now).action).toBe("leave");
    expect(
      outreachReapDecision({ id: "a", claimed_at: "not a date", result: null }, now).action,
    ).toBe("leave");
  });

  it("NEVER requeues, whatever the progress", () => {
    // The load-bearing rule. A requeue re-sends to everyone in the batch,
    // including the ones already called. If this ever returns "requeue",
    // clients get contacted twice.
    for (const result of [null, { sent: 0, total: 12 }, { sent: 5, total: 12 }, { sent: 12, total: 12 }]) {
      const d = outreachReapDecision({ id: "a", claimed_at: agoMs(STALE_SENDING_MS * 2), result }, now);
      expect(d.action).toBe("fail");
      expect(JSON.stringify(d)).not.toContain("requeue");
    }
  });
});

describe("describeInterruption", () => {
  it("names how far it got, so a resend is not a repeat", () => {
    const msg = describeInterruption({ sent: 5, failed: 0, total: 12 });
    expect(msg).toContain("5 of 12");
    // The actionable half: the agent must not resend the whole batch.
    expect(msg).toMatch(/remainder only|second time/);
  });

  it("says plainly when nobody was reached", () => {
    const msg = describeInterruption({ sent: 0, failed: 0, total: 12 });
    expect(msg).toContain("0 of 12");
    expect(msg).toMatch(/safe to reschedule/);
  });

  it("admits the uncertainty when no progress was recorded", () => {
    // A run that died before its first progress write. Claiming "0 reached"
    // here would be a guess, and acting on it could double-contact someone.
    const msg = describeInterruption(null);
    expect(msg).toMatch(/cannot tell/);
    expect(msg).toMatch(/may already have been reached/);
  });

  it("does not report progress from a malformed result", () => {
    // Garbage in the jsonb column must not become a confident count.
    expect(describeInterruption({ sent: 5, total: 0 })).toMatch(/cannot tell/);
    expect(describeInterruption({} as never)).toMatch(/cannot tell/);
  });
});

describe("outOfDrainBudget", () => {
  it("keeps going well inside the budget", () => {
    expect(outOfDrainBudget(1_000, 1_000 + DRAIN_BUDGET_MS - 1)).toBe(false);
  });

  it("stops at the budget", () => {
    expect(outOfDrainBudget(1_000, 1_000 + DRAIN_BUDGET_MS)).toBe(true);
  });

  it("stops before the route's own 300s ceiling", () => {
    // The point of the budget: finish on our terms. A run killed by the
    // platform strands whatever batch it was holding, and the reaper can only
    // report that, never undo the calls already placed.
    expect(DRAIN_BUDGET_MS).toBeLessThan(300_000);
  });

  it("waits longer to reap than a whole run can possibly take", () => {
    // Otherwise the reaper could fail a batch that is still legitimately
    // sending inside a live invocation.
    expect(STALE_SENDING_MS).toBeGreaterThan(DRAIN_BUDGET_MS);
  });
});

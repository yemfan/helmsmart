import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({}) }));

// eslint-disable-next-line import/first
import { classifyStalledRun } from "../service";

const NOW = Date.parse("2026-07-28T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

describe("classifyStalledRun", () => {
  it("reconciles an instruction whose run already reached a terminal state", () => {
    for (const status of ["completed", "failed", "cancelled", "budget_exceeded"] as const) {
      expect(
        classifyStalledRun({
          runStatus: status,
          runUpdatedAt: iso(30 * MIN),
          instructionCreatedAt: iso(31 * MIN),
          nowMs: NOW,
        }),
      ).toBe("reconcile");
    }
  });

  it("leaves an awaiting_approval run alone — it is waiting on the realtor, not stalled", () => {
    expect(
      classifyStalledRun({
        runStatus: "awaiting_approval",
        runUpdatedAt: iso(60 * MIN),
        instructionCreatedAt: iso(61 * MIN),
        nowMs: NOW,
      }),
    ).toBe("skip");
  });

  it("skips a running run still inside the fast-path window", () => {
    expect(
      classifyStalledRun({
        runStatus: "running",
        runUpdatedAt: iso(1 * MIN),
        instructionCreatedAt: iso(2 * MIN),
        nowMs: NOW,
      }),
    ).toBe("skip");
  });

  it("resumes a running/planning run idle past the resume window", () => {
    expect(
      classifyStalledRun({
        runStatus: "running",
        runUpdatedAt: iso(5 * MIN),
        instructionCreatedAt: iso(6 * MIN),
        nowMs: NOW,
      }),
    ).toBe("resume");
    expect(
      classifyStalledRun({
        runStatus: "planning",
        runUpdatedAt: iso(5 * MIN),
        instructionCreatedAt: iso(6 * MIN),
        nowMs: NOW,
      }),
    ).toBe("resume");
  });

  it("gives up on a run idle past the give-up window", () => {
    expect(
      classifyStalledRun({
        runStatus: "running",
        runUpdatedAt: iso(25 * MIN),
        instructionCreatedAt: iso(26 * MIN),
        nowMs: NOW,
      }),
    ).toBe("giveup");
  });

  it("falls back to instruction age when the run has no updated_at", () => {
    // fresh instruction, no timestamp → still owned by the fast path
    expect(
      classifyStalledRun({
        runStatus: "running",
        runUpdatedAt: null,
        instructionCreatedAt: iso(1 * MIN),
        nowMs: NOW,
      }),
    ).toBe("skip");
  });

  it("skips a no-run instruction until it is long-orphaned, then gives up", () => {
    expect(
      classifyStalledRun({
        runStatus: null,
        runUpdatedAt: null,
        instructionCreatedAt: iso(5 * MIN),
        nowMs: NOW,
      }),
    ).toBe("skip");
    expect(
      classifyStalledRun({
        runStatus: null,
        runUpdatedAt: null,
        instructionCreatedAt: iso(25 * MIN),
        nowMs: NOW,
      }),
    ).toBe("giveup");
  });
});

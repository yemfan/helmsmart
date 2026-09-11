import { describe, expect, it } from "vitest";
import { commandCenterState } from "@/lib/command-center";

const SIX = [{}, {}, {}, {}, {}, {}];

describe("commandCenterState", () => {
  it("is unconfigured with no employees, whatever the totals say", () => {
    expect(commandCenterState({ totals: { calls_answered: 4 }, employees: [] }, true)).toEqual({
      kind: "unconfigured",
    });
  });

  it("is idle — not a zero-count sentence — when six employees did nothing", () => {
    expect(commandCenterState({ totals: {}, employees: SIX }, false)).toEqual({
      kind: "idle",
      receptionistLive: false,
    });
  });

  it("treats all-zero totals as idle and carries whether the receptionist is live", () => {
    expect(commandCenterState({ totals: { calls_answered: 0, texts_sent: 0 }, employees: SIX }, true)).toEqual({
      kind: "idle",
      receptionistLive: true,
    });
  });

  it("is active with real work, keeping only positive metrics, largest first, at most three", () => {
    const state = commandCenterState(
      { totals: { a: 2, b: 0, c: 9, d: 5, e: 1 }, employees: SIX },
      false,
    );
    expect(state).toEqual({
      kind: "active",
      totalActions: 17,
      employeeCount: 6,
      topMetrics: [
        ["c", 9],
        ["d", 5],
        ["a", 2],
      ],
    });
  });

  it("ignores a non-finite total rather than printing it", () => {
    const state = commandCenterState({ totals: { a: Number.NaN, b: 3 }, employees: SIX }, false);
    expect(state).toMatchObject({ kind: "active", totalActions: 3, topMetrics: [["b", 3]] });
  });
});

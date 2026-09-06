import { describe, expect, it } from "vitest";
import { firstTenMinutes, formatMinutes, medianOf } from "../firstTenMinutes";

const t0 = "2026-09-01T10:00:00Z";
const plus = (min: number) => new Date(Date.parse(t0) + min * 60000).toISOString();

describe("first ten minutes", () => {
  it("takes medians and the share inside ten minutes, over all agents", () => {
    const out = firstTenMinutes([
      { agent_id: 1, signed_up_at: t0, first_proposal_at: plus(4), first_approval_at: plus(9) },
      { agent_id: 2, signed_up_at: t0, first_proposal_at: plus(30), first_approval_at: null },
      { agent_id: 3, signed_up_at: t0, first_proposal_at: null, first_approval_at: null },
      // A moment before signup is corrupt data, not a negative wait.
      { agent_id: 4, signed_up_at: plus(60), first_proposal_at: plus(10), first_approval_at: null },
    ]);
    expect(out.agents).toBe(4);
    expect(out.proposal).toEqual({ reached: 2, medianMinutes: 17, within10m: 0.25 });
    expect(out.approval).toEqual({ reached: 1, medianMinutes: 9, within10m: 0.25 });
  });

  it("is honest about an empty cohort", () => {
    expect(firstTenMinutes([])).toEqual({
      agents: 0,
      proposal: { reached: 0, medianMinutes: null, within10m: null },
      approval: { reached: 0, medianMinutes: null, within10m: null },
    });
  });

  it("median and formatting", () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    expect(medianOf([])).toBeNull();
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(3.4)).toBe("3 min");
    expect(formatMinutes(90)).toBe("1.5 h");
    expect(formatMinutes(60 * 48)).toBe("2 d");
  });
});

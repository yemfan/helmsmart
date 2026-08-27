import { describe, it, expect } from "vitest";
import { decideFollowUp } from "../decideFollowUp";
import { salesModels } from "../../sales-models";

const advisor = salesModels.advisor.cadence;

/**
 * The case this rule exists for: a lead who never replies but opens every
 * listing. Counting silent touches alone would drop the most interested person
 * in the pipeline for being quiet.
 */
describe("decideFollowUp", () => {
  it("keeps going while the ladder is still running", () => {
    expect(decideFollowUp({ unanswered: 1, engagementScore: 0, cadence: advisor }).decision).toBe(
      "continue",
    );
  });

  it("eases off — but does NOT stop — a silent lead who is still reading", () => {
    const r = decideFollowUp({ unanswered: 4, engagementScore: 35, cadence: advisor });
    expect(r.decision).toBe("slow_down");
    expect(r.reason).toMatch(/opening/i);
  });

  it("stops a silent lead who has gone dark", () => {
    const r = decideFollowUp({ unanswered: 4, engagementScore: 2, cadence: advisor });
    expect(r.decision).toBe("stop");
  });

  it("stops at the ceiling even for someone still reading", () => {
    // Twelve unanswered messages says something regardless of opens.
    const r = decideFollowUp({ unanswered: 99, engagementScore: 100, cadence: advisor });
    expect(r.decision).toBe("stop");
  });

  it("an opt-out ends it immediately, whatever the score", () => {
    const r = decideFollowUp({
      unanswered: 0,
      engagementScore: 100,
      cadence: advisor,
      optedOut: true,
    });
    expect(r.decision).toBe("stop");
    expect(r.reason).toMatch(/asked us to stop/i);
  });

  it("treats the engagement floor as inclusive", () => {
    const at = decideFollowUp({
      unanswered: 4,
      engagementScore: advisor.keepGoingAboveEngagement,
      cadence: advisor,
    });
    expect(at.decision).toBe("slow_down");
    const below = decideFollowUp({
      unanswered: 4,
      engagementScore: advisor.keepGoingAboveEngagement - 1,
      cadence: advisor,
    });
    expect(below.decision).toBe("stop");
  });

  it("gives every model a window where a lurker is spared", () => {
    for (const m of Object.values(salesModels)) {
      const r = decideFollowUp({
        unanswered: m.cadence.reconsiderAfterUnanswered,
        engagementScore: m.cadence.keepGoingAboveEngagement + 5,
        cadence: m.cadence,
      });
      expect(r.decision, m.id).toBe("slow_down");
    }
  });
});

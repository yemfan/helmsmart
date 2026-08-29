import { describe, expect, it } from "vitest";
import { TOUR_STEPS, shouldAutoStart, visibleSteps } from "../steps";

describe("TOUR_STEPS", () => {
  it("anchors to routes that exist in the nav, not to invented markup", () => {
    // These hrefs come from nav.config.tsx. If a route is renamed this test
    // does not catch it — but the step list is the one place to look.
    const hrefs = TOUR_STEPS.filter((s) => s.selector.startsWith("a[href="))
      .map((s) => s.selector.replace(/^a\[href="/, "").replace(/"\]$/, ""));
    expect(hrefs).toEqual([
      "/dashboard/boss",
      "/dashboard/inbox",
      "/dashboard/contacts",
      "/dashboard/tasks",
      "/dashboard/ai-team",
    ]);
  });

  it("gives every step a distinct id and its own copy keys", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.titleKey).toBe(`pages.tour.steps.${s.id}.title`);
      expect(s.bodyKey).toBe(`pages.tour.steps.${s.id}.body`);
    }
  });

  it("opens on Max, because that is where the work starts", () => {
    expect(TOUR_STEPS[0].id).toBe("askMax");
  });
});

describe("visibleSteps", () => {
  it("skips a step whose anchor is not on the page", () => {
    // The sidebar is filtered by role, so a broker and an agent do not see the
    // same items — pointing at nothing is worse than a shorter tour.
    const present = new Set(['a[href="/dashboard/boss"]', '[data-tour="quick-actions"]']);
    const out = visibleSteps(TOUR_STEPS, (sel) => present.has(sel));
    expect(out.map((s) => s.id)).toEqual(["askMax", "quickActions"]);
  });

  it("keeps the declared order", () => {
    const out = visibleSteps(TOUR_STEPS, () => true);
    expect(out.map((s) => s.id)).toEqual(TOUR_STEPS.map((s) => s.id));
  });

  it("returns nothing when the page has nothing to point at", () => {
    expect(visibleSteps(TOUR_STEPS, () => false)).toEqual([]);
  });
});

describe("shouldAutoStart", () => {
  it("opens for someone who has not seen it", () => {
    expect(shouldAutoStart({ seen: false, requested: false, availableStepCount: 6 })).toBe(true);
  });

  it("stays shut once it has been seen", () => {
    expect(shouldAutoStart({ seen: true, requested: false, availableStepCount: 6 })).toBe(false);
  });

  it("reopens when someone asks for it again", () => {
    expect(shouldAutoStart({ seen: true, requested: true, availableStepCount: 6 })).toBe(true);
  });

  it("never opens with nothing to point at", () => {
    // A half-rendered or signed-out page — showing a bubble over blank space
    // would be the worst version of this feature.
    expect(shouldAutoStart({ seen: false, requested: true, availableStepCount: 0 })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hasArea, isAnchorUsable, isClippedAway, rectsOverlap } from "../visibility";

const box = (top: number, left: number, width: number, height: number) => ({ top, left, width, height });

describe("isClippedAway", () => {
  it("catches the collapsed submenu that fooled the tour", () => {
    // The real shape: a link with a full 32px box inside a wrapper collapsed to
    // height 0 with overflow hidden. The link's own rect looks perfectly fine,
    // and checkVisibility() returns true — only the clipper gives it away.
    const link = box(385, 10, 232, 32);
    const collapsedWrapper = box(385, 10, 232, 0);
    expect(isClippedAway(link, [collapsedWrapper])).toBe(true);
  });

  it("leaves a genuinely visible row alone", () => {
    const row = box(538, 10, 232, 36);
    const scroller = box(120, 0, 260, 650);
    expect(isClippedAway(row, [scroller])).toBe(false);
  });

  it("treats an element with no area as gone", () => {
    expect(isClippedAway(box(100, 100, 0, 0), [])).toBe(true);
  });

  it("catches a row scrolled fully outside its scroll container", () => {
    const row = box(20, 10, 232, 32);
    const scroller = box(200, 0, 260, 400);
    expect(isClippedAway(row, [scroller])).toBe(true);
  });

  it("keeps a row that only partly overlaps its container", () => {
    // Half-visible is still visible enough to point at, and the tour scrolls
    // it into view anyway.
    const row = box(190, 10, 232, 32);
    const scroller = box(200, 0, 260, 400);
    expect(isClippedAway(row, [scroller])).toBe(false);
  });

  it("is fine when nothing clips", () => {
    expect(isClippedAway(box(10, 10, 100, 20), [])).toBe(false);
  });
});

describe("rectsOverlap", () => {
  it("is false for boxes that merely touch edges", () => {
    expect(rectsOverlap(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBe(false);
    expect(rectsOverlap(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
  });

  it("is true when they genuinely intersect", () => {
    expect(rectsOverlap(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
  });
});

describe("hasArea", () => {
  it("rejects a zero dimension in either direction", () => {
    expect(hasArea(box(0, 0, 0, 10))).toBe(false);
    expect(hasArea(box(0, 0, 10, 0))).toBe(false);
    expect(hasArea(box(0, 0, 10, 10))).toBe(true);
  });
});

describe("isAnchorUsable", () => {
  it("says no when there is no element at all", () => {
    expect(isAnchorUsable(null, [])).toBe(false);
  });

  it("says yes for a real row in a real scroller", () => {
    expect(isAnchorUsable(box(538, 10, 232, 36), [box(120, 0, 260, 650)])).toBe(true);
  });
});

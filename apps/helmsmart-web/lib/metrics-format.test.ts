import { describe, it, expect } from "vitest";
import { pctChange } from "./metrics-format";

describe("pctChange", () => {
  it("labels brand-new activity from a zero baseline", () => {
    expect(pctChange(5, 0, "en")).toBe("new");
    expect(pctChange(1, 0, "zh-Hans")).toBe("new");
  });

  it("labels a flat zero-to-zero (or negative) as flat", () => {
    expect(pctChange(0, 0, "en")).toBe("flat");
    expect(pctChange(-3, 0, "zh-Hans")).toBe("flat");
  });

  it("formats increases with a + sign and whole percent", () => {
    expect(pctChange(120, 100, "en")).toBe("+20%");
    expect(pctChange(150, 100, "en")).toBe("+50%");
    expect(pctChange(200, 100, "en")).toBe("+100%");
  });

  it("formats decreases with a - sign", () => {
    expect(pctChange(80, 100, "en")).toBe("-20%");
    expect(pctChange(0, 100, "en")).toBe("-100%");
  });

  it("reports 0% for no change", () => {
    expect(pctChange(100, 100, "en")).toBe("+0%");
  });

  it("rounds to the nearest whole percent", () => {
    expect(pctChange(133, 100, "en")).toBe("+33%");
    expect(pctChange(1335, 1000, "en")).toBe("+34%"); // 33.5 → 34 (half-expand)
    expect(pctChange(666, 1000, "en")).toBe("-33%");   // -33.4 → -33
  });

  it("handles fractional baselines", () => {
    expect(pctChange(1.5, 1, "en")).toBe("+50%");
  });

  /**
   * The locale is load-bearing, not decoration: it is what stops the digest
   * from grouping a Chinese-speaking owner's numbers the American way. zh-CN
   * happens to render percentages the same, so the assertion is that the
   * argument is honoured rather than that the two differ.
   */
  it("formats through the reader's locale", () => {
    expect(pctChange(120, 100, "zh-Hans")).toBe("+20%");
    expect(pctChange(80, 100, "zh-Hans")).toBe("-20%");
  });
});

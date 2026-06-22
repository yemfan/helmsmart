import { describe, expect, it } from "vitest";

import {
  computeAffordability,
  computeInvestmentReturns,
  monthlyMortgage,
} from "./finance";

describe("monthlyMortgage", () => {
  it("amortizes a standard loan", () => {
    // $400k @ 7% / 30yr ≈ $2,661/mo
    const m = monthlyMortgage(400_000, 7, 30);
    expect(Math.round(m)).toBe(2661);
  });
  it("handles 0% (straight division) and zero principal", () => {
    expect(monthlyMortgage(120_000, 0, 10)).toBe(1000);
    expect(monthlyMortgage(0, 7, 30)).toBe(0);
  });
});

describe("computeAffordability", () => {
  it("computes PITI + income needed from defaults", () => {
    const a = computeAffordability(1_000_000);
    expect(a.downPayment).toBe(200_000); // 20%
    expect(a.loanAmount).toBe(800_000);
    expect(Math.round(a.taxesMonthly)).toBe(917); // 1.1%/yr of 1M
    expect(a.totalMonthly).toBeGreaterThan(a.principalInterest);
    // income needed = PITI / 0.28
    expect(Math.round(a.incomeNeededMonthly)).toBe(Math.round(a.totalMonthly / 0.28));
  });
  it("honors overrides", () => {
    const a = computeAffordability(500_000, { downPct: 25, ratePct: 6, hoaMonthly: 300 });
    expect(a.downPayment).toBe(125_000);
    expect(a.hoaMonthly).toBe(300);
  });
});

describe("computeInvestmentReturns", () => {
  it("computes cap rate, cash flow, CoC, GRM", () => {
    const aff = computeAffordability(500_000);
    const r = computeInvestmentReturns(500_000, 3_000, aff);
    expect(r.grossAnnualRent).toBe(36_000);
    expect(Math.round(r.grossRentMultiplier)).toBe(14); // 500k / 36k
    expect(r.cashInvested).toBe(aff.downPayment + 15_000); // 3% closing
    expect(typeof r.capRatePct).toBe("number");
    expect(typeof r.cashOnCashPct).toBe("number");
  });
});

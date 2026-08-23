import { describe, expect, it } from "vitest";
import {
  applyRate,
  calculateCommissions,
  checkLeaderQualification,
  commissionYearFor,
  computeQualifyingRevenue,
  monthsElapsed,
  resolvePlanVersion,
} from "./engine";
import { DEFAULT_COMPENSATION_RULES, FALLBACK_PLAN_BUNDLE } from "./defaults";
import type {
  CommissionInput,
  CompensationRules,
  PartnerContext,
  PlanBundle,
  RevenueEvent,
} from "./types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function plans(overrides?: Partial<CompensationRules>): PlanBundle[] {
  const bundle = clone(FALLBACK_PLAN_BUNDLE);
  bundle.versions[0].rules = { ...bundle.versions[0].rules, ...overrides };
  return [bundle];
}

function partner(over: Partial<PartnerContext> = {}): PartnerContext {
  return {
    partnerId: "p-direct",
    status: "active",
    activeCustomerCount: 3,
    activeDirectPartnerCount: 0,
    academyLeadershipCompleted: false,
    inGoodStanding: true,
    ...over,
  };
}

function qualifiedLeader(over: Partial<PartnerContext> = {}): PartnerContext {
  return partner({
    partnerId: "p-leader",
    activeCustomerCount: 10,
    activeDirectPartnerCount: 1,
    academyLeadershipCompleted: true,
    ...over,
  });
}

function event(over: Partial<RevenueEvent> = {}): RevenueEvent {
  return {
    sourceEventId: "in_1",
    eventType: "renewal",
    occurredAt: "2027-03-15T00:00:00.000Z",
    grossCents: 9900,
    taxCents: 0,
    discountCents: 0,
    creditCents: 0,
    refundedCents: 0,
    chargebackCents: 0,
    currency: "USD",
    ...over,
  };
}

function input(over: Partial<CommissionInput> = {}): CommissionInput {
  return {
    subscription: {
      subscriptionId: "sub_1",
      customerId: "cus_1",
      productId: "closeboss",
      customerStartedAt: "2027-01-15T00:00:00.000Z",
    },
    event: event(),
    directPartner: partner(),
    upline: [],
    plans: plans(),
    ...over,
  };
}

describe("primitives", () => {
  it("rounds half away from zero so reversals mirror originals", () => {
    expect(applyRate(9900, 2500)).toBe(2475);
    expect(applyRate(-9900, 2500)).toBe(-2475);
    // 33.33 cents rounds up, and its negative rounds down by the same amount.
    expect(applyRate(1333, 2500)).toBe(333);
    expect(applyRate(-1333, 2500)).toBe(-333);
  });

  it("counts months on the subscription anniversary, not the calendar", () => {
    expect(monthsElapsed("2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z")).toBe(0);
    expect(monthsElapsed("2027-01-15T00:00:00Z", "2027-02-15T00:00:00Z")).toBe(1);
    expect(monthsElapsed("2027-01-15T00:00:00Z", "2028-01-14T00:00:00Z")).toBe(11);
    expect(monthsElapsed("2027-01-15T00:00:00Z", "2028-01-15T00:00:00Z")).toBe(12);
  });

  it("maps elapsed months onto 1-based commission years", () => {
    expect(commissionYearFor("2027-01-15T00:00:00Z", "2027-01-15T00:00:00Z")).toBe(1);
    expect(commissionYearFor("2027-01-15T00:00:00Z", "2028-01-14T00:00:00Z")).toBe(1);
    expect(commissionYearFor("2027-01-15T00:00:00Z", "2028-01-15T00:00:00Z")).toBe(2);
    expect(commissionYearFor("2027-01-15T00:00:00Z", "2029-01-15T00:00:00Z")).toBe(3);
    expect(commissionYearFor("2027-01-15T00:00:00Z", "2030-01-15T00:00:00Z")).toBe(4);
  });
});

describe("qualifying revenue", () => {
  it("excludes tax and nets out the customer discount by default", () => {
    const { qualifyingCents } = computeQualifyingRevenue(
      event({ grossCents: 10000, taxCents: 875, discountCents: 1000 }),
      DEFAULT_COMPENSATION_RULES.qualifyingRevenue,
    );
    expect(qualifyingCents).toBe(9000);
  });

  it("includes tax when an administrator turns the exclusion off", () => {
    const { qualifyingCents } = computeQualifyingRevenue(
      event({ grossCents: 10000, taxCents: 875 }),
      { ...DEFAULT_COMPENSATION_RULES.qualifyingRevenue, excludeTaxes: false },
    );
    expect(qualifyingCents).toBe(10875);
  });

  it("subtracts refunds, chargebacks and credits", () => {
    const { qualifyingCents } = computeQualifyingRevenue(
      event({ grossCents: 10000, creditCents: 500, refundedCents: 2000, chargebackCents: 1000 }),
      DEFAULT_COMPENSATION_RULES.qualifyingRevenue,
    );
    expect(qualifyingCents).toBe(6500);
  });
});

describe("direct commission", () => {
  it("pays 25% in year one", () => {
    const result = calculateCommissions(input());
    const direct = result.calculations.find((c) => c.kind === "direct");
    expect(direct?.rateBps).toBe(2500);
    expect(direct?.commissionYear).toBe(1);
    expect(direct?.amountCents).toBe(2475);
    expect(direct?.status).toBe("PENDING");
  });

  it("drops to 10% in years two and three", () => {
    const y2 = calculateCommissions(
      input({ event: event({ occurredAt: "2028-02-15T00:00:00Z" }) }),
    );
    expect(y2.calculations[0].commissionYear).toBe(2);
    expect(y2.calculations[0].amountCents).toBe(990);

    const y3 = calculateCommissions(
      input({ event: event({ occurredAt: "2029-02-15T00:00:00Z" }) }),
    );
    expect(y3.calculations[0].commissionYear).toBe(3);
    expect(y3.calculations[0].amountCents).toBe(990);
  });

  it("stops after the 36-month direct window", () => {
    const result = calculateCommissions(
      input({ event: event({ occurredAt: "2030-02-15T00:00:00Z" }) }),
    );
    expect(result.calculations).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("direct commission runs 36 months");
  });

  it("pays nothing to a suspended partner", () => {
    const result = calculateCommissions(input({ directPartner: partner({ status: "suspended" }) }));
    expect(result.calculations).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("suspended");
  });

  it("honours an administrator raising year one to 30%", () => {
    const result = calculateCommissions(
      input({
        plans: plans({
          direct: { yearRatesBps: [3000, 1000, 1000], durationMonths: 36 },
        }),
      }),
    );
    expect(result.calculations[0].rateBps).toBe(3000);
    expect(result.calculations[0].amountCents).toBe(2970);
  });

  it("refuses event types the plan does not make commissionable", () => {
    const result = calculateCommissions(input({ event: event({ eventType: "one_time" }) }));
    expect(result.calculations).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("not commissionable");
  });
});

describe("leadership override", () => {
  it("pays a qualified leader 5% of the same qualifying revenue", () => {
    const result = calculateCommissions(input({ upline: [qualifiedLeader()] }));
    const override = result.calculations.find((c) => c.kind === "leadership_override");
    expect(override?.rateBps).toBe(500);
    expect(override?.generation).toBe(1);
    expect(override?.amountCents).toBe(495);
  });

  it("pays nothing to an unqualified leader and says why", () => {
    const result = calculateCommissions(
      input({ upline: [qualifiedLeader({ activeCustomerCount: 4 })] }),
    );
    expect(result.calculations.some((c) => c.kind === "leadership_override")).toBe(false);
    const skip = result.skipped.find((s) => s.kind === "leadership_override");
    expect(skip?.reason).toContain("4 active personally referred customers, 10 required");
  });

  it("stops at one generation under the default plan", () => {
    const result = calculateCommissions(
      input({
        upline: [
          qualifiedLeader({ partnerId: "gen1" }),
          qualifiedLeader({ partnerId: "gen2" }),
        ],
      }),
    );
    const overrides = result.calculations.filter((c) => c.kind === "leadership_override");
    expect(overrides).toHaveLength(1);
    expect(overrides[0].partnerId).toBe("gen1");
    expect(result.skipped.some((s) => s.reason.includes("generation 2 is out of scope"))).toBe(true);
  });

  it("pays a second generation once an administrator allows one", () => {
    const result = calculateCommissions(
      input({
        upline: [
          qualifiedLeader({ partnerId: "gen1" }),
          qualifiedLeader({ partnerId: "gen2" }),
        ],
        plans: plans({
          leadership: { generationRatesBps: [500, 200], maxGenerations: 2, durationMonths: 36 },
        }),
      }),
    );
    const overrides = result.calculations.filter((c) => c.kind === "leadership_override");
    expect(overrides.map((o) => [o.partnerId, o.amountCents])).toEqual([
      ["gen1", 495],
      ["gen2", 198],
    ]);
  });

  it("ends the override after 36 months even while the customer keeps paying", () => {
    const result = calculateCommissions(
      input({
        event: event({ occurredAt: "2030-02-15T00:00:00Z" }),
        upline: [qualifiedLeader()],
      }),
    );
    expect(result.calculations).toHaveLength(0);
    expect(
      result.skipped.some((s) => s.reason.includes("the override runs 36 months")),
    ).toBe(true);
  });

  it("waives academy training when an administrator turns the requirement off", () => {
    const untrained = qualifiedLeader({ academyLeadershipCompleted: false });
    expect(checkLeaderQualification(untrained, plans()[0].versions[0]).qualified).toBe(false);

    const relaxed = plans({
      leaderQualification: {
        ...DEFAULT_COMPENSATION_RULES.leaderQualification,
        requireAcademyTraining: false,
      },
    });
    expect(checkLeaderQualification(untrained, relaxed[0].versions[0]).qualified).toBe(true);
  });
});

describe("refunds and chargebacks", () => {
  it("produces a negative, REFUNDED commission for a refund event", () => {
    const result = calculateCommissions(
      input({
        event: event({ grossCents: 0, refundedCents: 9900 }),
        upline: [qualifiedLeader()],
      }),
    );
    const direct = result.calculations.find((c) => c.kind === "direct");
    const override = result.calculations.find((c) => c.kind === "leadership_override");
    expect(direct?.amountCents).toBe(-2475);
    expect(direct?.status).toBe("REFUNDED");
    expect(override?.amountCents).toBe(-495);
  });

  it("flags a chargeback distinctly from a refund", () => {
    const result = calculateCommissions(
      input({ event: event({ grossCents: 0, chargebackCents: 9900 }) }),
    );
    expect(result.calculations[0].status).toBe("CHARGEBACK");
    expect(result.calculations[0].amountCents).toBe(-2475);
  });
});

describe("plan versioning", () => {
  const v1 = clone(FALLBACK_PLAN_BUNDLE);
  v1.versions[0].effectiveFrom = "2027-01-01";
  v1.versions[0].effectiveUntil = "2028-01-01";
  const v2 = {
    ...v1.versions[0],
    id: "version-2",
    version: 2,
    label: "Plan V2",
    effectiveFrom: "2028-01-01",
    effectiveUntil: null,
    rules: {
      ...clone(DEFAULT_COMPENSATION_RULES),
      direct: { yearRatesBps: [2000, 800, 800], durationMonths: 36 },
    },
  };
  const versioned: PlanBundle = { plan: v1.plan, versions: [v1.versions[0], v2] };

  it("keeps a 2027 customer on V1 for their whole lifetime", () => {
    const resolved = resolvePlanVersion(versioned, "2027-06-01", "2029-06-01");
    expect(resolved?.version).toBe(1);

    const result = calculateCommissions(
      input({
        subscription: {
          subscriptionId: "sub_1",
          customerId: "cus_1",
          productId: "closeboss",
          customerStartedAt: "2027-06-01T00:00:00Z",
        },
        event: event({ occurredAt: "2029-06-01T00:00:00Z" }),
        plans: [versioned],
      }),
    );
    expect(result.calculations[0].planVersion).toBe(1);
    expect(result.calculations[0].rateBps).toBe(1000);
  });

  it("prices a 2028 customer on V2", () => {
    const result = calculateCommissions(
      input({
        subscription: {
          subscriptionId: "sub_2",
          customerId: "cus_2",
          productId: "closeboss",
          customerStartedAt: "2028-03-01T00:00:00Z",
        },
        event: event({ occurredAt: "2028-04-01T00:00:00Z" }),
        plans: [versioned],
      }),
    );
    expect(result.calculations[0].planVersion).toBe(2);
    expect(result.calculations[0].rateBps).toBe(2000);
  });

  it("migrates everyone onto the current version when the anchor says so", () => {
    const migrating = clone(versioned);
    migrating.versions[1].rules.versionAnchor = "transaction_date";
    const resolved = resolvePlanVersion(migrating, "2027-06-01", "2029-06-01");
    expect(resolved?.version).toBe(2);
  });
});

describe("product-specific plans", () => {
  it("prefers a product plan over the default plan", () => {
    const productPlan = clone(FALLBACK_PLAN_BUNDLE);
    productPlan.plan = {
      ...productPlan.plan,
      id: "plan-helmsmart",
      key: "helmsmart",
      productId: "helmsmart",
      isDefault: false,
    };
    productPlan.versions[0] = {
      ...productPlan.versions[0],
      id: "helmsmart-v1",
      planId: "plan-helmsmart",
      rules: {
        ...clone(DEFAULT_COMPENSATION_RULES),
        direct: { yearRatesBps: [1500, 1500, 1500, 1500], durationMonths: 48 },
      },
    };

    const result = calculateCommissions(
      input({
        subscription: {
          subscriptionId: "sub_3",
          customerId: "cus_3",
          productId: "helmsmart",
          customerStartedAt: "2027-01-15T00:00:00Z",
        },
        plans: [...plans(), productPlan],
      }),
    );
    expect(result.calculations[0].planKey).toBe("helmsmart");
    expect(result.calculations[0].rateBps).toBe(1500);
  });

  it("falls back to the default plan for a product without its own", () => {
    const result = calculateCommissions(
      input({
        subscription: {
          subscriptionId: "sub_4",
          customerId: "cus_4",
          productId: "some-future-product",
          customerStartedAt: "2027-01-15T00:00:00Z",
        },
      }),
    );
    expect(result.calculations[0].planKey).toBe("default");
  });
});

describe("auditability", () => {
  it("stores an explanation and the inputs behind every amount", () => {
    const result = calculateCommissions(input({ upline: [qualifiedLeader()] }));
    for (const calc of result.calculations) {
      expect(calc.explanation.length).toBeGreaterThan(2);
      expect(calc.planVersionId).toBeTruthy();
      expect(calc.inputs).toHaveProperty("commissionYear");
      expect(calc.inputs).toHaveProperty("event");
    }
  });
});

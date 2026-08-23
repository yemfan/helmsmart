import type { CompensationRules, PlanBundle } from "./types";

/**
 * THE ONLY PLACE DEFAULT COMPENSATION NUMBERS ARE WRITTEN DOWN.
 *
 * These values seed compensation plan version 1 in the database. After seeding,
 * the database is authoritative and an administrator edits the numbers there —
 * nothing in the UI or the engine reads this file at runtime except the
 * marketing site's fallback path (see `repository.ts`), which is used only when
 * the database is unreachable so a public page never renders a blank rate.
 */
export const DEFAULT_COMPENSATION_RULES: CompensationRules = {
  direct: {
    // Year 1 = 25%, Year 2 = 10%, Year 3 = 10%.
    yearRatesBps: [2500, 1000, 1000],
    durationMonths: 36,
  },
  leadership: {
    // One generation, 5%.
    generationRatesBps: [500],
    maxGenerations: 1,
    durationMonths: 36,
  },
  leaderQualification: {
    minPersonalActiveCustomers: 10,
    minActiveDirectPartners: 1,
    requireAcademyTraining: true,
    requireGoodStanding: true,
  },
  qualifyingRevenue: {
    eligibleEventTypes: ["new_subscription", "renewal", "upgrade", "add_on", "expansion"],
    excludeTaxes: true,
    commissionOnNetOfDiscount: true,
    excludeCredits: true,
    reverseOnRefund: true,
    reverseOnChargeback: true,
    minimumQualifyingRevenueCents: 0,
  },
  customerDiscount: {
    defaultDiscountBps: 1000,
    maxDiscountBps: 2000,
    discountDurationMonths: 12,
  },
  versionAnchor: "customer_start",
};

export const DEFAULT_PLAN_KEY = "default";
export const DEFAULT_PLAN_VERSION_LABEL = "Plan V1";

/** Offline fallback bundle mirroring the seeded row, for public pages only. */
export const FALLBACK_PLAN_BUNDLE: PlanBundle = {
  plan: {
    id: "00000000-0000-0000-0000-000000000001",
    key: DEFAULT_PLAN_KEY,
    name: "AI Business Works Partner Plan",
    productId: null,
    isDefault: true,
    archivedAt: null,
  },
  versions: [
    {
      id: "00000000-0000-0000-0000-000000000002",
      planId: "00000000-0000-0000-0000-000000000001",
      version: 1,
      label: DEFAULT_PLAN_VERSION_LABEL,
      status: "active",
      effectiveFrom: "2027-01-01",
      effectiveUntil: null,
      rules: DEFAULT_COMPENSATION_RULES,
      notes: "Seeded default plan.",
    },
  ],
};

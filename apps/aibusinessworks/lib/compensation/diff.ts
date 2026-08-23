import { formatBps, formatCents } from "./format";
import type { CompensationRules } from "./types";

export interface RuleChange {
  path: string;
  label: string;
  previous: string;
  next: string;
  summary: string;
}

const bpsList = (values: number[]) => values.map((v) => formatBps(v)).join(" / ");
const months = (value: number) => `${value} months`;
const yesNo = (value: boolean) => (value ? "Enabled" : "Disabled");

interface FieldSpec {
  path: string;
  label: string;
  read: (rules: CompensationRules) => string;
}

/**
 * The fields an administrator can change, and how each is written into the
 * compensation change log. Keeping this list explicit means a new rule cannot
 * be quietly edited without appearing in the history.
 */
const FIELDS: FieldSpec[] = [
  {
    path: "direct.yearRatesBps",
    label: "Direct commission rates by year",
    read: (r) => bpsList(r.direct.yearRatesBps),
  },
  {
    path: "direct.durationMonths",
    label: "Direct commission duration",
    read: (r) => months(r.direct.durationMonths),
  },
  {
    path: "leadership.generationRatesBps",
    label: "Leadership Override rates by generation",
    read: (r) => bpsList(r.leadership.generationRatesBps),
  },
  {
    path: "leadership.maxGenerations",
    label: "Maximum Leadership generations",
    read: (r) => String(r.leadership.maxGenerations),
  },
  {
    path: "leadership.durationMonths",
    label: "Leadership Override duration",
    read: (r) => months(r.leadership.durationMonths),
  },
  {
    path: "leaderQualification.minPersonalActiveCustomers",
    label: "Minimum personally referred active customers",
    read: (r) => String(r.leaderQualification.minPersonalActiveCustomers),
  },
  {
    path: "leaderQualification.minActiveDirectPartners",
    label: "Minimum active Direct Partners",
    read: (r) => String(r.leaderQualification.minActiveDirectPartners),
  },
  {
    path: "leaderQualification.requireAcademyTraining",
    label: "Required Academy training",
    read: (r) => yesNo(r.leaderQualification.requireAcademyTraining),
  },
  {
    path: "leaderQualification.requireGoodStanding",
    label: "Good standing requirement",
    read: (r) => yesNo(r.leaderQualification.requireGoodStanding),
  },
  {
    path: "qualifyingRevenue.eligibleEventTypes",
    label: "Commissionable revenue types",
    read: (r) => r.qualifyingRevenue.eligibleEventTypes.join(", ") || "none",
  },
  {
    path: "qualifyingRevenue.excludeTaxes",
    label: "Exclude taxes from qualifying revenue",
    read: (r) => yesNo(r.qualifyingRevenue.excludeTaxes),
  },
  {
    path: "qualifyingRevenue.commissionOnNetOfDiscount",
    label: "Commission net of customer discount",
    read: (r) => yesNo(r.qualifyingRevenue.commissionOnNetOfDiscount),
  },
  {
    path: "qualifyingRevenue.excludeCredits",
    label: "Exclude account credits",
    read: (r) => yesNo(r.qualifyingRevenue.excludeCredits),
  },
  {
    path: "qualifyingRevenue.reverseOnRefund",
    label: "Reverse commission on refund",
    read: (r) => yesNo(r.qualifyingRevenue.reverseOnRefund),
  },
  {
    path: "qualifyingRevenue.reverseOnChargeback",
    label: "Reverse commission on chargeback",
    read: (r) => yesNo(r.qualifyingRevenue.reverseOnChargeback),
  },
  {
    path: "qualifyingRevenue.minimumQualifyingRevenueCents",
    label: "Minimum qualifying revenue per invoice",
    read: (r) => formatCents(r.qualifyingRevenue.minimumQualifyingRevenueCents),
  },
  {
    path: "customerDiscount.defaultDiscountBps",
    label: "Default customer discount",
    read: (r) => formatBps(r.customerDiscount.defaultDiscountBps),
  },
  {
    path: "customerDiscount.maxDiscountBps",
    label: "Maximum customer discount",
    read: (r) => formatBps(r.customerDiscount.maxDiscountBps),
  },
  {
    path: "customerDiscount.discountDurationMonths",
    label: "Customer discount duration",
    read: (r) => months(r.customerDiscount.discountDurationMonths),
  },
  {
    path: "versionAnchor",
    label: "Plan version anchoring",
    read: (r) =>
      r.versionAnchor === "customer_start"
        ? "Customer start date (grandfathered)"
        : "Transaction date (migrating)",
  },
];

/** Field-level differences between two rule sets, ready for the change log. */
export function diffRules(before: CompensationRules, after: CompensationRules): RuleChange[] {
  const changes: RuleChange[] = [];
  for (const field of FIELDS) {
    const previous = field.read(before);
    const next = field.read(after);
    if (previous === next) continue;
    changes.push({
      path: field.path,
      label: field.label,
      previous,
      next,
      summary: `${field.label} changed from ${previous} to ${next}.`,
    });
  }
  return changes;
}

export function describeRules(rules: CompensationRules): { label: string; value: string }[] {
  return FIELDS.map((field) => ({ label: field.label, value: field.read(rules) }));
}

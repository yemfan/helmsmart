import "server-only";
import { cache } from "react";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";
import { DEFAULT_COMPENSATION_RULES, FALLBACK_PLAN_BUNDLE } from "./defaults";
import type {
  CompensationPlan,
  CompensationPlanVersion,
  CompensationRules,
  PlanBundle,
  RevenueEventType,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const EVENT_TYPES: RevenueEventType[] = [
  "new_subscription",
  "renewal",
  "upgrade",
  "add_on",
  "expansion",
  "one_time",
];

function int(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function bpsArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.map((v) => int(v, 0)).map((v) => Math.max(0, Math.min(10_000, v)));
}

/**
 * Coerce a `rules` jsonb blob into a complete `CompensationRules`.
 *
 * Anything missing or malformed falls back to the seeded default for that field
 * rather than throwing - a half-saved admin edit must never take the public
 * compensation page down, and it must never silently produce a zero rate.
 */
export function parseRules(raw: unknown): CompensationRules {
  const d = DEFAULT_COMPENSATION_RULES;
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const direct = r.direct ?? {};
  const leadership = r.leadership ?? {};
  const qualification = r.leaderQualification ?? {};
  const revenue = r.qualifyingRevenue ?? {};
  const discount = r.customerDiscount ?? {};

  const eligible = Array.isArray(revenue.eligibleEventTypes)
    ? (revenue.eligibleEventTypes as unknown[]).filter((t): t is RevenueEventType =>
        EVENT_TYPES.includes(t as RevenueEventType),
      )
    : d.qualifyingRevenue.eligibleEventTypes;

  return {
    direct: {
      yearRatesBps: bpsArray(direct.yearRatesBps, d.direct.yearRatesBps),
      durationMonths: int(direct.durationMonths, d.direct.durationMonths),
    },
    leadership: {
      generationRatesBps: bpsArray(leadership.generationRatesBps, d.leadership.generationRatesBps),
      maxGenerations: int(leadership.maxGenerations, d.leadership.maxGenerations),
      durationMonths: int(leadership.durationMonths, d.leadership.durationMonths),
    },
    leaderQualification: {
      minPersonalActiveCustomers: int(
        qualification.minPersonalActiveCustomers,
        d.leaderQualification.minPersonalActiveCustomers,
      ),
      minActiveDirectPartners: int(
        qualification.minActiveDirectPartners,
        d.leaderQualification.minActiveDirectPartners,
      ),
      requireAcademyTraining: bool(
        qualification.requireAcademyTraining,
        d.leaderQualification.requireAcademyTraining,
      ),
      requireGoodStanding: bool(
        qualification.requireGoodStanding,
        d.leaderQualification.requireGoodStanding,
      ),
    },
    qualifyingRevenue: {
      eligibleEventTypes: eligible.length ? eligible : d.qualifyingRevenue.eligibleEventTypes,
      excludeTaxes: bool(revenue.excludeTaxes, d.qualifyingRevenue.excludeTaxes),
      commissionOnNetOfDiscount: bool(
        revenue.commissionOnNetOfDiscount,
        d.qualifyingRevenue.commissionOnNetOfDiscount,
      ),
      excludeCredits: bool(revenue.excludeCredits, d.qualifyingRevenue.excludeCredits),
      reverseOnRefund: bool(revenue.reverseOnRefund, d.qualifyingRevenue.reverseOnRefund),
      reverseOnChargeback: bool(revenue.reverseOnChargeback, d.qualifyingRevenue.reverseOnChargeback),
      minimumQualifyingRevenueCents: int(
        revenue.minimumQualifyingRevenueCents,
        d.qualifyingRevenue.minimumQualifyingRevenueCents,
      ),
    },
    customerDiscount: {
      defaultDiscountBps: int(discount.defaultDiscountBps, d.customerDiscount.defaultDiscountBps),
      maxDiscountBps: int(discount.maxDiscountBps, d.customerDiscount.maxDiscountBps),
      discountDurationMonths: int(
        discount.discountDurationMonths,
        d.customerDiscount.discountDurationMonths,
      ),
    },
    versionAnchor:
      (r.versionAnchor as unknown) === "transaction_date" ? "transaction_date" : "customer_start",
  };
}

/* -------------------------------------------------------------------------- */
/*  Loading                                                                    */
/* -------------------------------------------------------------------------- */

type PlanRow = {
  id: string;
  key: string;
  name: string;
  product_id: string | null;
  is_default: boolean;
  archived_at: string | null;
};

type VersionRow = {
  id: string;
  plan_id: string;
  version: number;
  label: string;
  status: CompensationPlanVersion["status"];
  effective_from: string;
  effective_until: string | null;
  rules: unknown;
  notes: string | null;
};

function toPlan(row: PlanRow): CompensationPlan {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    productId: row.product_id,
    isDefault: row.is_default,
    archivedAt: row.archived_at,
  };
}

function toVersion(row: VersionRow): CompensationPlanVersion {
  return {
    id: row.id,
    planId: row.plan_id,
    version: row.version,
    label: row.label,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    rules: parseRules(row.rules),
    notes: row.notes,
  };
}

/**
 * Every plan and version the caller is allowed to see, as engine-shaped bundles.
 *
 * Falls back to the seeded default when the platform has no database yet, so
 * the public compensation pages render correct numbers on a fresh checkout.
 */
export const loadPlanBundles = cache(async (): Promise<PlanBundle[]> => {
  if (!isSupabaseConfigured()) return [FALLBACK_PLAN_BUNDLE];

  try {
    const supabase = createPublicClient();
    const [{ data: plans, error: planError }, { data: versions, error: versionError }] =
      await Promise.all([
        supabase.from("abw_compensation_plans").select("*").is("archived_at", null),
        supabase
          .from("abw_compensation_plan_versions")
          .select("*")
          .order("effective_from", { ascending: false }),
      ]);

    if (planError || versionError || !plans?.length) return [FALLBACK_PLAN_BUNDLE];

    return (plans as PlanRow[]).map((plan) => ({
      plan: toPlan(plan),
      versions: ((versions ?? []) as VersionRow[])
        .filter((v) => v.plan_id === plan.id)
        .map(toVersion),
    }));
  } catch {
    return [FALLBACK_PLAN_BUNDLE];
  }
});

/** The rule set every public page renders from: the live default plan, today. */
export const loadPublicRules = cache(
  async (): Promise<{ rules: CompensationRules; version: CompensationPlanVersion | null }> => {
    const bundles = await loadPlanBundles();
    const bundle = bundles.find((b) => b.plan.isDefault) ?? bundles[0];
    if (!bundle) {
      return { rules: DEFAULT_COMPENSATION_RULES, version: null };
    }
    const now = Date.now();
    const version =
      bundle.versions
        .filter((v) => v.status === "active")
        .filter((v) => new Date(v.effectiveFrom).getTime() <= now)
        .filter((v) => !v.effectiveUntil || new Date(v.effectiveUntil).getTime() > now)
        .sort(
          (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
        )[0] ??
      // Before the first plan goes into effect, show the plan that is coming.
      bundle.versions.filter((v) => v.status === "active").at(-1) ??
      null;

    return { rules: version?.rules ?? DEFAULT_COMPENSATION_RULES, version };
  },
);

/** Per-product rules, for the product-specific compensation table. */
export async function loadProductRules(): Promise<
  { productId: string | null; planKey: string; planName: string; rules: CompensationRules }[]
> {
  const bundles = await loadPlanBundles();
  const now = Date.now();
  return bundles.map((bundle) => {
    const version =
      bundle.versions
        .filter((v) => v.status === "active")
        .filter((v) => new Date(v.effectiveFrom).getTime() <= now)
        .filter((v) => !v.effectiveUntil || new Date(v.effectiveUntil).getTime() > now)[0] ??
      bundle.versions[0];
    return {
      productId: bundle.plan.productId,
      planKey: bundle.plan.key,
      planName: bundle.plan.name,
      rules: version?.rules ?? DEFAULT_COMPENSATION_RULES,
    };
  });
}

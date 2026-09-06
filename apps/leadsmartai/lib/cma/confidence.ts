import type { CmaCompRow, CmaValuation } from "@/lib/cma/types";

/**
 * What a CMA's confidence means, in words a seller can read.
 *
 * The engine stores an integer 1–95 (`confidence_score`). A bare "confidence
 * 72%" on the page told the realtor nothing about WHY, and nothing about how
 * wide the range is — the two things that actually decide whether to trust
 * the number (audit §16: "add a range and a one-line basis"). This turns the
 * score into a band and the snapshot into the facts the band rests on.
 *
 * Client-safe: pure functions, no server imports.
 */

export type ConfidenceBand = "high" | "medium" | "low";

/** 75+ high · 50–74 medium · below 50 low · null when the engine gave none. */
export function confidenceBand(score: number | null | undefined): ConfidenceBand | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export type CmaBasis = {
  /** Sold comparables the valuation used. */
  compCount: number;
  /** Farthest comp from the subject, in miles (one decimal), or null when unknown. */
  maxDistanceMiles: number | null;
  /** Whole months since the most recent comp sold, or null when no dated comp. */
  newestSoldMonthsAgo: number | null;
  /** Half the low–high band as a percentage of the estimate (±), or null. */
  spreadPct: number | null;
};

/**
 * The facts under the number. Tolerates the partial rows an older snapshot or
 * a failed run can carry: a comp with no date is skipped for recency, a $0
 * estimate yields no spread rather than Infinity.
 */
export function cmaBasis(
  valuation: Pick<CmaValuation, "estimatedValue" | "low" | "high"> | null | undefined,
  comps: readonly CmaCompRow[] | null | undefined,
  now: Date = new Date(),
): CmaBasis {
  const rows = comps ?? [];
  const distances = rows.map((c) => c.distanceMiles).filter((d) => typeof d === "number" && Number.isFinite(d) && d >= 0);
  const maxDistanceMiles = distances.length ? Math.round(Math.max(...distances) * 10) / 10 : null;

  let newest: number | null = null;
  for (const c of rows) {
    const t = Date.parse(c.soldDate ?? "");
    if (!Number.isFinite(t)) continue;
    if (newest === null || t > newest) newest = t;
  }
  const newestSoldMonthsAgo =
    newest === null ? null : Math.max(0, Math.floor((now.getTime() - newest) / (30.4375 * 24 * 3600 * 1000)));

  let spreadPct: number | null = null;
  if (valuation) {
    const { estimatedValue: est, low, high } = valuation;
    if ([est, low, high].every((n) => typeof n === "number" && Number.isFinite(n)) && est > 0 && high >= low) {
      spreadPct = Math.round(((high - low) / 2 / est) * 100);
    }
  }

  return { compCount: rows.length, maxDistanceMiles, newestSoldMonthsAgo, spreadPct };
}

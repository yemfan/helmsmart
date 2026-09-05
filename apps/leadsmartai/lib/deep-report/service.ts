import "server-only";

import { generateAiCma } from "@/lib/cma/aiCma";
import { isSmartCmaFailure } from "@/lib/cma/fetchSmartCma";
import { findRecentCmaSnapshotByAddress } from "@/lib/cma/service";
import { fetchStaticMap } from "@/lib/cma/streetViewPhoto";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { generateDeepReportAi } from "./aiDeepReport";
import {
  computeAffordability,
  computeInvestmentReturns,
  type LoanAssumptions,
} from "./finance";
import { DEEP_REPORT_DISCLAIMER, type DeepReport, type PropertyUse } from "./types";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

export type GenerateDeepReportInput = {
  /** Numeric agent id (for CMA reuse + agent profile). */
  agentId: string;
  address: string;
  propertyUse: PropertyUse;
  /** Optional loan-term overrides; merged over the defaults. */
  loanOverrides?: Partial<LoanAssumptions>;
};

export async function generateDeepReport(
  input: GenerateDeepReportInput,
): Promise<{ ok: true; report: DeepReport } | { ok: false; status: number; error: string }> {
  const address = input.address.trim();
  if (!address) return { ok: false, status: 400, error: "A property address is required." };

  // 1) Value + comps — reuse a recent CMA for this agent/address, else generate.
  const existing = await findRecentCmaSnapshotByAddress(input.agentId, address, 30);
  let snapshot = existing?.snapshot ?? null;
  if (!snapshot) {
    const cma = await generateAiCma({ address });
    if (isSmartCmaFailure(cma)) return { ok: false, status: cma.status || 502, error: cma.error };
    snapshot = cma.snapshot;
  }

  const subj = snapshot.subject;
  const val = snapshot.valuation;
  const price = val.estimatedValue || 0;

  // 2) AI: deal rating + rent (investment) + schools + neighborhood.
  const ai = await generateDeepReportAi({
    locale: await agentUiLocale(input.agentId),
    address,
    propertyUse: input.propertyUse,
    estimate: {
      estimatedValue: val.estimatedValue ?? null,
      low: val.low ?? null,
      high: val.high ?? null,
      avgPricePerSqft: val.avgPricePerSqft ?? null,
    },
    comps: snapshot.comps.map((c) => ({ address: c.address, price: c.price, sqft: c.sqft, soldDate: c.soldDate })),
  });

  // 3) Affordability (HOA from the subject + Mello-Roos from the AI feed the PITI).
  const affordability = computeAffordability(price, {
    ...input.loanOverrides,
    hoaMonthly: input.loanOverrides?.hoaMonthly ?? subj.hoaMonthly ?? 0,
    melloRoosMonthly: input.loanOverrides?.melloRoosMonthly ?? ai.melloRoosMonthly ?? 0,
  });

  // 4) Investment returns (only for investment use + when a rent estimate exists).
  const investment =
    input.propertyUse === "investment" && ai.rentEstimateMonthly && ai.rentEstimateMonthly > 0
      ? { ...computeInvestmentReturns(price, ai.rentEstimateMonthly, affordability), rentSummary: ai.rentSummary }
      : null;

  // 5) Agent profile + location map (parallel).
  const [agent, locationMap] = await Promise.all([
    loadPresentationAgent(input.agentId),
    fetchStaticMap(subj.address || address),
  ]);

  // Fold the CMA's cited sources in with the AI's.
  const sources = [...ai.sources];
  for (const s of snapshot.sources ?? []) {
    if (s.url && !sources.some((x) => x.url === s.url)) sources.push(s);
  }

  const report: DeepReport = {
    propertyUse: input.propertyUse,
    property: {
      address: subj.address || address,
      beds: subj.beds || null,
      baths: subj.baths || null,
      sqft: subj.sqft || null,
      propertyType: subj.propertyType,
      yearBuilt: subj.yearBuilt || null,
      lotSizeSqft: subj.lotSizeSqft ?? null,
      hoaMonthly: subj.hoaMonthly ?? null,
    },
    estimate: {
      estimatedValue: val.estimatedValue ?? null,
      low: val.low ?? null,
      high: val.high ?? null,
      avgPricePerSqft: val.avgPricePerSqft ?? null,
      summary: snapshot.summary ?? "",
    },
    comps: snapshot.comps.map((c) => ({
      address: c.address,
      price: c.price,
      sqft: c.sqft,
      beds: c.beds ?? null,
      baths: c.baths ?? null,
      propertyType: c.propertyType ?? null,
      yearBuilt: c.yearBuilt ?? null,
      pricePerSqft: c.pricePerSqft,
      soldDate: c.soldDate,
    })),
    affordability,
    dealRating: ai.dealRating,
    investment,
    schools: ai.schools,
    neighborhood: ai.neighborhood,
    locationMap: locationMap ? { dataUrl: locationMap.dataUrl, format: locationMap.format } : null,
    agent,
    sources,
    disclaimer: DEEP_REPORT_DISCLAIMER,
  };

  return { ok: true, report };
}

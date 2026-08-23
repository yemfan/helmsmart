import { applyRate } from "./engine";
import type { Cents, CompensationRules } from "./types";

/**
 * ILLUSTRATION MATH ONLY.
 *
 * This module powers the public commission simulator. It answers "what would
 * this structure look like?" using the same configured rates as the ledger, but
 * it is not, and must never become, the source of a payable amount. Official
 * commissions come from `engine.calculateCommissions` running on the server
 * against real billing events.
 */

export interface SimulationInput {
  /** Customer's monthly subscription price, in cents. */
  monthlyCents: Cents;
  /** How many such customers to illustrate. */
  customerCount: number;
  /** How many months the illustration assumes each customer stays. */
  retentionMonths: number;
  /** Apply the plan's default customer discount to the billed amount. */
  applyCustomerDiscount: boolean;
}

export interface SimulationYear {
  year: number;
  months: number;
  rateBps: number;
  commissionCents: Cents;
}

export interface SimulationOutput {
  qualifyingMonthlyCents: Cents;
  years: SimulationYear[];
  totalCents: Cents;
  /** Sum of the direct rates across the paid years, e.g. 45%. */
  headlineTotalBps: number;
  /** What a qualified Leader would see from one Direct Partner's customer. */
  leadership: {
    rateBps: number;
    monthlyCents: Cents;
    durationMonths: number;
    totalCents: Cents;
  };
  cappedByPlan: boolean;
}

export function simulate(rules: CompensationRules, input: SimulationInput): SimulationOutput {
  const count = Math.max(0, Math.floor(input.customerCount));
  const discountBps = input.applyCustomerDiscount ? rules.customerDiscount.defaultDiscountBps : 0;
  const perCustomerMonthly = input.monthlyCents - applyRate(input.monthlyCents, discountBps);
  const qualifyingMonthly = perCustomerMonthly * count;

  const planMonths = rules.direct.durationMonths;
  const illustratedMonths = Math.min(Math.max(0, input.retentionMonths), planMonths);

  const years: SimulationYear[] = [];
  let total = 0;

  for (let year = 1; year <= Math.ceil(planMonths / 12); year += 1) {
    const windowStart = (year - 1) * 12;
    const months = Math.max(0, Math.min(illustratedMonths - windowStart, 12));
    if (months === 0 && windowStart >= illustratedMonths) break;
    const rateBps = rules.direct.yearRatesBps[year - 1] ?? 0;
    const commission = applyRate(qualifyingMonthly * months, rateBps);
    total += commission;
    years.push({ year, months, rateBps, commissionCents: commission });
  }

  const headlineTotalBps = rules.direct.yearRatesBps
    .slice(0, Math.ceil(planMonths / 12))
    .reduce((sum, bps) => sum + bps, 0);

  const overrideBps = rules.leadership.generationRatesBps[0] ?? 0;
  const overrideMonths = Math.min(illustratedMonths, rules.leadership.durationMonths);
  const overrideMonthly = applyRate(qualifyingMonthly, overrideBps);

  return {
    qualifyingMonthlyCents: qualifyingMonthly,
    years,
    totalCents: total,
    headlineTotalBps,
    leadership: {
      rateBps: overrideBps,
      monthlyCents: overrideMonthly,
      durationMonths: rules.leadership.durationMonths,
      totalCents: overrideMonthly * overrideMonths,
    },
    cappedByPlan: input.retentionMonths > planMonths,
  };
}

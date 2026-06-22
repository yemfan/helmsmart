/**
 * Pure finance math for the Property Deep Report — loan affordability and
 * (for investment use) rental returns. No I/O, no server-only import, so
 * vitest can exercise it directly.
 *
 * All assumptions are explicit + overridable; defaults reflect typical
 * 2026 buyer scenarios and are surfaced in the report so nothing is hidden.
 */

export type LoanAssumptions = {
  /** Down payment as a percent of price (e.g. 20). */
  downPct: number;
  /** Annual interest rate percent (e.g. 7). */
  ratePct: number;
  /** Loan term in years. */
  termYears: number;
  /** Annual property tax as a percent of price. */
  taxRatePct: number;
  /** Annual homeowner's insurance as a percent of price. */
  insuranceRatePct: number;
  /** Monthly HOA dues in dollars. */
  hoaMonthly: number;
};

export const DEFAULT_LOAN_ASSUMPTIONS: LoanAssumptions = {
  downPct: 20,
  ratePct: 7.0,
  termYears: 30,
  taxRatePct: 1.1,
  insuranceRatePct: 0.35,
  hoaMonthly: 0,
};

export type Affordability = {
  price: number;
  downPayment: number;
  loanAmount: number;
  principalInterest: number;
  taxesMonthly: number;
  insuranceMonthly: number;
  hoaMonthly: number;
  /** Full monthly housing payment (PITI + HOA). */
  totalMonthly: number;
  /** Gross monthly income needed at a 28% front-end ratio. */
  incomeNeededMonthly: number;
  incomeNeededAnnual: number;
  assumptions: LoanAssumptions;
};

/** Standard amortized monthly payment. */
export function monthlyMortgage(principal: number, annualRatePct: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

export function computeAffordability(price: number, partial: Partial<LoanAssumptions> = {}): Affordability {
  const a: LoanAssumptions = { ...DEFAULT_LOAN_ASSUMPTIONS, ...partial };
  const p = Math.max(0, price);
  const downPayment = (p * a.downPct) / 100;
  const loanAmount = Math.max(0, p - downPayment);
  const principalInterest = monthlyMortgage(loanAmount, a.ratePct, a.termYears);
  const taxesMonthly = (p * a.taxRatePct) / 100 / 12;
  const insuranceMonthly = (p * a.insuranceRatePct) / 100 / 12;
  const hoaMonthly = Math.max(0, a.hoaMonthly);
  const totalMonthly = principalInterest + taxesMonthly + insuranceMonthly + hoaMonthly;
  // 28% front-end ratio is the conventional qualifying guideline.
  const incomeNeededMonthly = totalMonthly / 0.28;
  return {
    price: p,
    downPayment,
    loanAmount,
    principalInterest,
    taxesMonthly,
    insuranceMonthly,
    hoaMonthly,
    totalMonthly,
    incomeNeededMonthly,
    incomeNeededAnnual: incomeNeededMonthly * 12,
    assumptions: a,
  };
}

export type InvestmentReturns = {
  rentMonthly: number;
  grossAnnualRent: number;
  /** Operating expenses excluding debt service (taxes/ins in PITI excluded here to avoid double count). */
  monthlyOperatingReserve: number;
  /** Net monthly cash flow after PITI + operating reserve. */
  monthlyCashFlow: number;
  annualCashFlow: number;
  /** Net operating income / price. */
  capRatePct: number;
  /** Annual cash flow / cash invested. */
  cashOnCashPct: number;
  /** Gross rent multiplier = price / annual rent. */
  grossRentMultiplier: number;
  cashInvested: number;
};

/**
 * Investment metrics. `reservePct` covers maintenance + vacancy + management
 * (defaults to 15% of rent); PITI already includes taxes/insurance/HOA, so
 * those aren't double-counted in cash flow. NOI for cap rate is gross rent
 * minus all operating expenses (taxes + insurance + HOA + reserve), excluding
 * debt service per the standard definition.
 */
export function computeInvestmentReturns(
  price: number,
  rentMonthly: number,
  affordability: Affordability,
  opts: { reservePct?: number; closingCostPct?: number } = {},
): InvestmentReturns {
  const reservePct = opts.reservePct ?? 15;
  const closingCostPct = opts.closingCostPct ?? 3;
  const rent = Math.max(0, rentMonthly);
  const grossAnnualRent = rent * 12;
  const monthlyOperatingReserve = (rent * reservePct) / 100;

  // NOI excludes debt service but includes taxes + insurance + HOA + reserve.
  const annualOperatingExpenses =
    (affordability.taxesMonthly + affordability.insuranceMonthly + affordability.hoaMonthly + monthlyOperatingReserve) * 12;
  const noi = grossAnnualRent - annualOperatingExpenses;
  const capRatePct = price > 0 ? (noi / price) * 100 : 0;

  const monthlyCashFlow = rent - affordability.totalMonthly - monthlyOperatingReserve;
  const annualCashFlow = monthlyCashFlow * 12;

  const cashInvested = affordability.downPayment + (price * closingCostPct) / 100;
  const cashOnCashPct = cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;

  return {
    rentMonthly: rent,
    grossAnnualRent,
    monthlyOperatingReserve,
    monthlyCashFlow,
    annualCashFlow,
    capRatePct,
    cashOnCashPct,
    grossRentMultiplier: grossAnnualRent > 0 ? price / grossAnnualRent : 0,
    cashInvested,
  };
}

/**
 * Compensation domain types.
 *
 * Two hard rules govern everything in this module:
 *
 *  1. No commission number is ever hard-coded outside `defaults.ts`. Every rate,
 *     duration and threshold is read from a compensation plan version that an
 *     administrator can edit.
 *  2. Money is integer cents and rates are integer basis points (2500 bps = 25%).
 *     Floats never touch a stored amount.
 */

/** 1/100th of a percent. 2500 bps = 25.00%. */
export type Bps = number;
/** Integer minor units of the transaction currency. 9900 = $99.00 USD. */
export type Cents = number;

export type RevenueEventType =
  | "new_subscription"
  | "renewal"
  | "upgrade"
  | "add_on"
  | "expansion"
  | "one_time";

export type CommissionKind = "direct" | "leadership_override";

export type CommissionStatus =
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "REVERSED"
  | "REFUNDED"
  | "CHARGEBACK";

export type PlanVersionStatus = "draft" | "active" | "archived";

/**
 * Which date decides the plan version a transaction is priced under.
 *
 * `customer_start` (default) grandfathers a customer onto the plan that was in
 * effect the day they subscribed — a later plan change cannot silently reprice
 * their history. `transaction_date` moves every customer onto the current plan.
 */
export type VersionAnchor = "customer_start" | "transaction_date";

export interface DirectCommissionRules {
  /** Rate for commission year N, index 0 = year 1. Years past the array earn 0. */
  yearRatesBps: Bps[];
  /** Hard stop for direct commissions, counted from the customer's start date. */
  durationMonths: number;
}

export interface LeadershipRules {
  /** Override rate for generation N, index 0 = generation 1. */
  generationRatesBps: Bps[];
  /** How many upline generations may be paid. 1 under the default plan. */
  maxGenerations: number;
  /** Hard stop for override, counted from the customer's start date. */
  durationMonths: number;
}

export interface LeaderQualificationRules {
  minPersonalActiveCustomers: number;
  minActiveDirectPartners: number;
  requireAcademyTraining: boolean;
  requireGoodStanding: boolean;
}

export interface QualifyingRevenueRules {
  /** Revenue event types that earn commission. */
  eligibleEventTypes: RevenueEventType[];
  /** Tax is never commissionable when true. */
  excludeTaxes: boolean;
  /** Commission on the discounted amount actually paid, not list price. */
  commissionOnNetOfDiscount: boolean;
  /** Account credits applied to the invoice reduce qualifying revenue. */
  excludeCredits: boolean;
  /** Refunded amounts generate reversals. */
  reverseOnRefund: boolean;
  /** Chargebacks generate reversals. */
  reverseOnChargeback: boolean;
  /** Minimum qualifying revenue on an invoice before any commission is created. */
  minimumQualifyingRevenueCents: Cents;
}

export interface CustomerDiscountRules {
  defaultDiscountBps: Bps;
  maxDiscountBps: Bps;
  discountDurationMonths: number;
}

/** The complete, versioned rule set. Every stored commission points at one of these. */
export interface CompensationRules {
  direct: DirectCommissionRules;
  leadership: LeadershipRules;
  leaderQualification: LeaderQualificationRules;
  qualifyingRevenue: QualifyingRevenueRules;
  customerDiscount: CustomerDiscountRules;
  versionAnchor: VersionAnchor;
}

export interface CompensationPlan {
  id: string;
  /** Stable machine key, e.g. "default" or "closeboss-launch-2027". */
  key: string;
  name: string;
  /** null = applies to every product that has no plan of its own. */
  productId: string | null;
  isDefault: boolean;
  archivedAt: string | null;
}

export interface CompensationPlanVersion {
  id: string;
  planId: string;
  /** Monotonic within a plan: 1, 2, 3 ... */
  version: number;
  label: string;
  status: PlanVersionStatus;
  /** ISO date. Inclusive. */
  effectiveFrom: string;
  /** ISO date. Exclusive. null = open-ended. */
  effectiveUntil: string | null;
  rules: CompensationRules;
  notes: string | null;
}

export interface PlanBundle {
  plan: CompensationPlan;
  versions: CompensationPlanVersion[];
}

/* -------------------------------------------------------------------------- */
/*  Engine input / output                                                      */
/* -------------------------------------------------------------------------- */

/** One billable event from the billing system, already normalised. */
export interface RevenueEvent {
  /** Idempotency key from the source system (invoice id, charge id...). */
  sourceEventId: string;
  eventType: RevenueEventType;
  /** ISO timestamp the revenue was recognised. */
  occurredAt: string;
  /** Gross amount billed before tax and discount. */
  grossCents: Cents;
  taxCents: Cents;
  discountCents: Cents;
  creditCents: Cents;
  refundedCents: Cents;
  chargebackCents: Cents;
  currency: string;
}

export interface SubscriptionContext {
  subscriptionId: string;
  customerId: string;
  productId: string;
  /** ISO date the customer's commission clock starts. Never changes. */
  customerStartedAt: string;
}

/** A partner in the attribution chain, plus the facts needed to qualify them. */
export interface PartnerContext {
  partnerId: string;
  status: "pending" | "active" | "suspended" | "terminated";
  /** Personally referred customers currently paying. */
  activeCustomerCount: number;
  /** Directly sponsored partners currently active. */
  activeDirectPartnerCount: number;
  academyLeadershipCompleted: boolean;
  inGoodStanding: boolean;
}

export interface CommissionInput {
  subscription: SubscriptionContext;
  event: RevenueEvent;
  /** The partner who referred the customer. Earns the direct commission. */
  directPartner: PartnerContext;
  /**
   * Upline, nearest first: index 0 sponsors `directPartner`, index 1 sponsors
   * index 0, and so on. The engine pays at most `maxGenerations` of these.
   */
  upline: PartnerContext[];
  /** All plans the resolver may choose from. */
  plans: PlanBundle[];
}

/** Everything needed to answer "why did this partner receive this exact amount?" */
export interface CommissionCalculation {
  kind: CommissionKind;
  partnerId: string;
  /** 1 for the direct partner's sponsor, 2 for their sponsor, etc. 0 for direct. */
  generation: number;
  planId: string;
  planKey: string;
  planVersionId: string;
  planVersion: number;
  effectiveFrom: string;
  commissionYear: number;
  rateBps: Bps;
  qualifyingRevenueCents: Cents;
  amountCents: Cents;
  currency: string;
  status: CommissionStatus;
  /** Human-readable trace of every decision the engine made. */
  explanation: string[];
  /** Machine-readable snapshot of the inputs used, stored on the ledger row. */
  inputs: Record<string, unknown>;
}

/** A commission that was not created, and the reason. Surfaced in admin tooling. */
export interface CommissionSkip {
  kind: CommissionKind;
  partnerId: string | null;
  generation: number;
  reason: string;
}

export interface CommissionResult {
  calculations: CommissionCalculation[];
  skipped: CommissionSkip[];
  qualifyingRevenueCents: Cents;
  currency: string;
}

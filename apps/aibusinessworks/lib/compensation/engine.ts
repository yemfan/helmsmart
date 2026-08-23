import type {
  Bps,
  Cents,
  CommissionCalculation,
  CommissionInput,
  CommissionResult,
  CommissionSkip,
  CommissionStatus,
  CompensationPlanVersion,
  PartnerContext,
  PlanBundle,
  QualifyingRevenueRules,
  RevenueEvent,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** Half away from zero, so a reversal rounds the mirror image of its original. */
export function roundCents(value: number): Cents {
  return value >= 0 ? Math.round(value) : -Math.round(-value);
}

export function applyRate(amountCents: Cents, rateBps: Bps): Cents {
  return roundCents((amountCents * rateBps) / 10_000);
}

/**
 * Whole months from startIso to endIso, anniversary-aware: the day after the
 * start date is month 0, the day before the first anniversary is month 11.
 * Negative when endIso precedes startIso.
 */
export function monthsElapsed(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return months;
}

/** 1-based commission year for an event, given the customer start date. */
export function commissionYearFor(customerStartedAt: string, occurredAt: string): number {
  return Math.floor(monthsElapsed(customerStartedAt, occurredAt) / 12) + 1;
}

/* -------------------------------------------------------------------------- */
/*  Plan + version resolution                                                  */
/* -------------------------------------------------------------------------- */

/** Product-specific plan when one exists, otherwise the default plan. */
export function resolvePlanBundle(plans: PlanBundle[], productId: string): PlanBundle | null {
  const live = plans.filter((p) => !p.plan.archivedAt);
  return (
    live.find((p) => p.plan.productId === productId) ??
    live.find((p) => p.plan.isDefault) ??
    null
  );
}

function versionActiveOn(bundle: PlanBundle, isoDate: string): CompensationPlanVersion | null {
  const at = new Date(isoDate).getTime();
  const candidates = bundle.versions
    .filter((v) => v.status === "active")
    .filter((v) => new Date(v.effectiveFrom).getTime() <= at)
    .filter((v) => v.effectiveUntil === null || new Date(v.effectiveUntil).getTime() > at)
    // Latest effective_from wins if two windows overlap through admin error.
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return candidates[0] ?? null;
}

/**
 * Pick the plan version a transaction is priced under.
 *
 * The version in effect on the transaction date decides the anchoring policy.
 * If that policy is customer_start (the default) the customer is then
 * grandfathered onto whichever version was in effect the day they subscribed.
 * That two-step is what stops a new plan from silently repricing history.
 */
export function resolvePlanVersion(
  bundle: PlanBundle,
  customerStartedAt: string,
  transactionAt: string,
): CompensationPlanVersion | null {
  const atTransaction = versionActiveOn(bundle, transactionAt);
  const anchor = atTransaction?.rules.versionAnchor ?? "customer_start";
  if (anchor === "transaction_date") return atTransaction;
  return versionActiveOn(bundle, customerStartedAt) ?? atTransaction;
}

/* -------------------------------------------------------------------------- */
/*  Qualifying revenue                                                         */
/* -------------------------------------------------------------------------- */

export interface QualifyingRevenueBreakdown {
  qualifyingCents: Cents;
  lines: string[];
}

export function computeQualifyingRevenue(
  event: RevenueEvent,
  rules: QualifyingRevenueRules,
): QualifyingRevenueBreakdown {
  const lines: string[] = [];
  let total: Cents = event.grossCents;
  lines.push(`Gross billed: ${event.grossCents}`);

  if (rules.excludeTaxes) {
    lines.push(`Tax excluded: -${event.taxCents}`);
  } else {
    total += event.taxCents;
    lines.push(`Tax included: +${event.taxCents}`);
  }

  if (rules.commissionOnNetOfDiscount && event.discountCents) {
    total -= event.discountCents;
    lines.push(`Customer discount netted out: -${event.discountCents}`);
  }
  if (rules.excludeCredits && event.creditCents) {
    total -= event.creditCents;
    lines.push(`Account credits excluded: -${event.creditCents}`);
  }
  if (rules.reverseOnRefund && event.refundedCents) {
    total -= event.refundedCents;
    lines.push(`Refunded amount reversed: -${event.refundedCents}`);
  }
  if (rules.reverseOnChargeback && event.chargebackCents) {
    total -= event.chargebackCents;
    lines.push(`Chargeback reversed: -${event.chargebackCents}`);
  }

  lines.push(`Qualifying revenue: ${total}`);
  return { qualifyingCents: total, lines };
}

function statusForAmount(amountCents: Cents, event: RevenueEvent): CommissionStatus {
  if (amountCents < 0) {
    return event.chargebackCents > 0 ? "CHARGEBACK" : "REFUNDED";
  }
  return "PENDING";
}

/* -------------------------------------------------------------------------- */
/*  Leader qualification                                                       */
/* -------------------------------------------------------------------------- */

export interface QualificationCheck {
  qualified: boolean;
  reasons: string[];
}

export function checkLeaderQualification(
  partner: PartnerContext,
  version: CompensationPlanVersion,
): QualificationCheck {
  const q = version.rules.leaderQualification;
  const reasons: string[] = [];

  if (partner.status !== "active") {
    reasons.push(`Partner status is ${partner.status}, not active`);
  }
  if (partner.activeCustomerCount < q.minPersonalActiveCustomers) {
    reasons.push(
      `${partner.activeCustomerCount} active personally referred customers, ${q.minPersonalActiveCustomers} required`,
    );
  }
  if (partner.activeDirectPartnerCount < q.minActiveDirectPartners) {
    reasons.push(
      `${partner.activeDirectPartnerCount} active Direct Partners, ${q.minActiveDirectPartners} required`,
    );
  }
  if (q.requireAcademyTraining && !partner.academyLeadershipCompleted) {
    reasons.push("Required Academy leadership training not completed");
  }
  if (q.requireGoodStanding && !partner.inGoodStanding) {
    reasons.push("Partner is not in good standing");
  }

  return { qualified: reasons.length === 0, reasons };
}

/* -------------------------------------------------------------------------- */
/*  The engine                                                                 */
/* -------------------------------------------------------------------------- */

function directCommissionSkipReason(
  partner: PartnerContext,
  months: number,
  durationMonths: number,
): string | null {
  if (partner.status !== "active") {
    return `Referring partner status is ${partner.status}, not active`;
  }
  if (months < 0) {
    return "Event predates the customer start date";
  }
  if (months >= durationMonths) {
    return `Customer is ${months} months old; direct commission runs ${durationMonths} months`;
  }
  return null;
}

function emptyResult(
  reason: string,
  partnerId: string | null,
  qualifying: Cents,
  currency: string,
): CommissionResult {
  return {
    calculations: [],
    skipped: [{ kind: "direct", partnerId, generation: 0, reason }],
    qualifyingRevenueCents: qualifying,
    currency,
  };
}

/**
 * Turn one revenue event into the commissions it earns.
 *
 * Pure: no clock, no I/O, no database. The caller supplies every fact and
 * persists the result. That is what makes a commission reproducible years later
 * from its stored inputs alone.
 */
export function calculateCommissions(input: CommissionInput): CommissionResult {
  const { subscription, event, directPartner, upline, plans } = input;
  const skipped: CommissionSkip[] = [];
  const calculations: CommissionCalculation[] = [];
  const currency = event.currency;

  const bundle = resolvePlanBundle(plans, subscription.productId);
  if (!bundle) {
    return emptyResult(
      `No compensation plan covers product ${subscription.productId}`,
      directPartner.partnerId,
      0,
      currency,
    );
  }

  const version = resolvePlanVersion(bundle, subscription.customerStartedAt, event.occurredAt);
  if (!version) {
    return emptyResult(
      `Plan "${bundle.plan.key}" has no active version effective on ${event.occurredAt}`,
      directPartner.partnerId,
      0,
      currency,
    );
  }

  const rules = version.rules;

  if (!rules.qualifyingRevenue.eligibleEventTypes.includes(event.eventType)) {
    return emptyResult(
      `Event type "${event.eventType}" is not commissionable under ${version.label}`,
      directPartner.partnerId,
      0,
      currency,
    );
  }

  const revenue = computeQualifyingRevenue(event, rules.qualifyingRevenue);
  const qualifying = revenue.qualifyingCents;
  const min = rules.qualifyingRevenue.minimumQualifyingRevenueCents;

  if (qualifying > 0 && qualifying < min) {
    return emptyResult(
      `Qualifying revenue ${qualifying} is below the ${min} minimum`,
      directPartner.partnerId,
      qualifying,
      currency,
    );
  }

  const months = monthsElapsed(subscription.customerStartedAt, event.occurredAt);
  const year = Math.floor(months / 12) + 1;
  const planFacts = {
    planKey: bundle.plan.key,
    planVersion: version.version,
    versionAnchor: rules.versionAnchor,
    customerStartedAt: subscription.customerStartedAt,
    occurredAt: event.occurredAt,
    monthsSinceCustomerStart: months,
    commissionYear: year,
  };

  /* ---- Direct commission ------------------------------------------------ */
  const directSkip = directCommissionSkipReason(directPartner, months, rules.direct.durationMonths);
  if (directSkip) {
    skipped.push({
      kind: "direct",
      partnerId: directPartner.partnerId,
      generation: 0,
      reason: directSkip,
    });
  } else {
    const rateBps = rules.direct.yearRatesBps[year - 1] ?? 0;
    if (rateBps === 0) {
      skipped.push({
        kind: "direct",
        partnerId: directPartner.partnerId,
        generation: 0,
        reason: `${version.label} pays 0% in commission year ${year}`,
      });
    } else {
      const amount = applyRate(qualifying, rateBps);
      calculations.push({
        kind: "direct",
        partnerId: directPartner.partnerId,
        generation: 0,
        planId: bundle.plan.id,
        planKey: bundle.plan.key,
        planVersionId: version.id,
        planVersion: version.version,
        effectiveFrom: version.effectiveFrom,
        commissionYear: year,
        rateBps,
        qualifyingRevenueCents: qualifying,
        amountCents: amount,
        currency,
        status: statusForAmount(amount, event),
        explanation: [
          `Customer started ${subscription.customerStartedAt}; the event on ${event.occurredAt} falls ${months} months in, which is commission year ${year}.`,
          `Plan "${bundle.plan.key}" ${version.label} (effective ${version.effectiveFrom}) pays ${rateBps / 100}% direct in year ${year}.`,
          ...revenue.lines,
          `Direct commission = ${qualifying} x ${rateBps} bps = ${amount}.`,
        ],
        inputs: { ...planFacts, event, partner: directPartner, rules: rules.direct },
      });
    }
  }

  /* ---- Leadership override ---------------------------------------------- */
  const maxGen = Math.max(0, rules.leadership.maxGenerations);
  for (let gen = 1; gen <= maxGen; gen += 1) {
    const leader = upline[gen - 1];
    if (!leader) {
      skipped.push({
        kind: "leadership_override",
        partnerId: null,
        generation: gen,
        reason: `No generation ${gen} upline partner`,
      });
      continue;
    }
    if (months < 0 || months >= rules.leadership.durationMonths) {
      skipped.push({
        kind: "leadership_override",
        partnerId: leader.partnerId,
        generation: gen,
        reason: `Customer is ${months} months old; the override runs ${rules.leadership.durationMonths} months`,
      });
      continue;
    }
    const qualification = checkLeaderQualification(leader, version);
    if (!qualification.qualified) {
      skipped.push({
        kind: "leadership_override",
        partnerId: leader.partnerId,
        generation: gen,
        reason: `Leader not qualified: ${qualification.reasons.join("; ")}`,
      });
      continue;
    }
    const rateBps = rules.leadership.generationRatesBps[gen - 1] ?? 0;
    if (rateBps === 0) {
      skipped.push({
        kind: "leadership_override",
        partnerId: leader.partnerId,
        generation: gen,
        reason: `${version.label} pays 0% override at generation ${gen}`,
      });
      continue;
    }
    const amount = applyRate(qualifying, rateBps);
    calculations.push({
      kind: "leadership_override",
      partnerId: leader.partnerId,
      generation: gen,
      planId: bundle.plan.id,
      planKey: bundle.plan.key,
      planVersionId: version.id,
      planVersion: version.version,
      effectiveFrom: version.effectiveFrom,
      commissionYear: year,
      rateBps,
      qualifyingRevenueCents: qualifying,
      amountCents: amount,
      currency,
      status: statusForAmount(amount, event),
      explanation: [
        `Generation ${gen} leader ${leader.partnerId} sponsors referring partner ${directPartner.partnerId}.`,
        `Leader qualified with ${leader.activeCustomerCount} active personally referred customers and ${leader.activeDirectPartnerCount} active Direct Partners.`,
        `Customer is ${months} months old, inside the ${rules.leadership.durationMonths}-month override window.`,
        ...revenue.lines,
        `Leadership override = ${qualifying} x ${rateBps} bps = ${amount}.`,
      ],
      inputs: { ...planFacts, event, leader, rules: rules.leadership },
    });
  }

  for (let gen = maxGen + 1; gen <= upline.length; gen += 1) {
    skipped.push({
      kind: "leadership_override",
      partnerId: upline[gen - 1].partnerId,
      generation: gen,
      reason: `${version.label} pays ${maxGen} generation(s); generation ${gen} is out of scope`,
    });
  }

  return { calculations, skipped, qualifyingRevenueCents: qualifying, currency };
}

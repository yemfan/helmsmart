import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCommissions } from "@/lib/compensation/engine";
import { parseRules } from "@/lib/compensation/repository";
import type {
  CommissionResult,
  PartnerContext,
  PlanBundle,
  RevenueEvent,
} from "@/lib/compensation/types";

/**
 * The commission ledger writer.
 *
 * This module is the ONLY place a commission transaction is created. Nothing in
 * the browser, and nothing in a page component, can produce a payable amount.
 * The flow is always: billing fact -> engine -> immutable ledger row.
 */

/** How far up the sponsor chain to look before the plan's generation cap applies. */
const MAX_UPLINE_DEPTH = 5;
const ACTIVE_CUSTOMER_STATUSES = ["trialing", "active", "past_due"];

type Db = SupabaseClient;

/* -------------------------------------------------------------------------- */
/*  Plan loading (service role)                                                */
/* -------------------------------------------------------------------------- */

export async function loadPlanBundlesAdmin(supabase: Db): Promise<PlanBundle[]> {
  const [{ data: plans }, { data: versions }] = await Promise.all([
    supabase.from("abw_compensation_plans").select("*").is("archived_at", null),
    supabase.from("abw_compensation_plan_versions").select("*"),
  ]);

  return (plans ?? []).map((plan) => ({
    plan: {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      productId: plan.product_id,
      isDefault: plan.is_default,
      archivedAt: plan.archived_at,
    },
    versions: (versions ?? [])
      .filter((v) => v.plan_id === plan.id)
      .map((v) => ({
        id: v.id,
        planId: v.plan_id,
        version: v.version,
        label: v.label,
        status: v.status,
        effectiveFrom: v.effective_from,
        effectiveUntil: v.effective_until,
        rules: parseRules(v.rules),
        notes: v.notes,
      })),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Partner facts                                                              */
/* -------------------------------------------------------------------------- */

interface PartnerFactsRow {
  id: string;
  status: PartnerContext["status"];
  good_standing: boolean;
  academy_leadership_completed_at: string | null;
  sponsor_partner_id: string | null;
}

async function loadPartnerContext(
  supabase: Db,
  partnerId: string,
): Promise<{ context: PartnerContext; sponsorId: string | null } | null> {
  const { data: partner } = await supabase
    .from("abw_partners")
    .select("id, status, good_standing, academy_leadership_completed_at, sponsor_partner_id")
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner) return null;
  const row = partner as PartnerFactsRow;

  const [{ count: customerCount }, { count: partnerCount }] = await Promise.all([
    supabase
      .from("abw_customers")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .in("status", ACTIVE_CUSTOMER_STATUSES),
    supabase
      .from("abw_partners")
      .select("id", { count: "exact", head: true })
      .eq("sponsor_partner_id", partnerId)
      .eq("status", "active"),
  ]);

  return {
    context: {
      partnerId: row.id,
      status: row.status,
      activeCustomerCount: customerCount ?? 0,
      activeDirectPartnerCount: partnerCount ?? 0,
      academyLeadershipCompleted: Boolean(row.academy_leadership_completed_at),
      inGoodStanding: row.good_standing,
    },
    sponsorId: row.sponsor_partner_id,
  };
}

async function loadUpline(supabase: Db, startSponsorId: string | null): Promise<PartnerContext[]> {
  const upline: PartnerContext[] = [];
  const seen = new Set<string>();
  let nextId = startSponsorId;

  while (nextId && upline.length < MAX_UPLINE_DEPTH && !seen.has(nextId)) {
    seen.add(nextId);
    const loaded = await loadPartnerContext(supabase, nextId);
    if (!loaded) break;
    upline.push(loaded.context);
    nextId = loaded.sponsorId;
  }

  return upline;
}

/* -------------------------------------------------------------------------- */
/*  Processing                                                                 */
/* -------------------------------------------------------------------------- */

export interface ProcessOutcome {
  eventId: string;
  status: "written" | "skipped" | "error";
  created: number;
  skipped: { kind: string; reason: string }[];
  message?: string;
}

interface RevenueEventRow {
  id: string;
  subscription_id: string;
  customer_id: string;
  product_id: string;
  source_event_id: string;
  event_type: RevenueEvent["eventType"];
  occurred_at: string;
  gross_cents: number;
  tax_cents: number;
  discount_cents: number;
  credit_cents: number;
  refunded_cents: number;
  chargeback_cents: number;
  currency: string;
  processed_at: string | null;
}

/**
 * Turn one recorded revenue event into ledger rows.
 *
 * Idempotent: the unique index on (revenue_event_id, partner_id, kind,
 * generation) means a re-run inserts nothing new, so replaying a webhook or
 * re-running a batch is safe.
 */
export async function processRevenueEvent(
  eventId: string,
  options: { force?: boolean } = {},
): Promise<ProcessOutcome> {
  const supabase = createAdminClient();

  const { data: eventRow } = await supabase
    .from("abw_revenue_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (!eventRow) {
    return { eventId, status: "error", created: 0, skipped: [], message: "Revenue event not found." };
  }
  const event = eventRow as RevenueEventRow;

  if (event.processed_at && !options.force) {
    return {
      eventId,
      status: "skipped",
      created: 0,
      skipped: [{ kind: "event", reason: "Already processed." }],
    };
  }

  const { data: customer } = await supabase
    .from("abw_customers")
    .select("id, partner_id, started_at, product_id")
    .eq("id", event.customer_id)
    .maybeSingle();

  if (!customer?.partner_id) {
    await markProcessed(supabase, eventId);
    return {
      eventId,
      status: "skipped",
      created: 0,
      skipped: [{ kind: "direct", reason: "Customer is not attributed to a Partner." }],
    };
  }

  const referring = await loadPartnerContext(supabase, customer.partner_id as string);
  if (!referring) {
    await markProcessed(supabase, eventId);
    return {
      eventId,
      status: "skipped",
      created: 0,
      skipped: [{ kind: "direct", reason: "Referring Partner record not found." }],
    };
  }

  const [upline, plans] = await Promise.all([
    loadUpline(supabase, referring.sponsorId),
    loadPlanBundlesAdmin(supabase),
  ]);

  const result: CommissionResult = calculateCommissions({
    subscription: {
      subscriptionId: event.subscription_id,
      customerId: event.customer_id,
      productId: event.product_id,
      customerStartedAt: customer.started_at as string,
    },
    event: {
      sourceEventId: event.source_event_id,
      eventType: event.event_type,
      occurredAt: event.occurred_at,
      grossCents: event.gross_cents,
      taxCents: event.tax_cents,
      discountCents: event.discount_cents,
      creditCents: event.credit_cents,
      refundedCents: event.refunded_cents,
      chargebackCents: event.chargeback_cents,
      currency: event.currency,
    },
    directPartner: referring.context,
    upline,
    plans,
  });

  let created = 0;
  if (result.calculations.length) {
    const rows = result.calculations.map((calc) => ({
      partner_id: calc.partnerId,
      kind: calc.kind,
      generation: calc.generation,
      source_partner_id: referring.context.partnerId,
      customer_id: event.customer_id,
      subscription_id: event.subscription_id,
      revenue_event_id: event.id,
      product_id: event.product_id,
      plan_id: calc.planId,
      plan_version_id: calc.planVersionId,
      plan_version: calc.planVersion,
      plan_effective_from: calc.effectiveFrom,
      commission_year: calc.commissionYear,
      rate_bps: calc.rateBps,
      qualifying_revenue_cents: calc.qualifyingRevenueCents,
      amount_cents: calc.amountCents,
      currency: calc.currency,
      status: calc.status,
      calculation: { explanation: calc.explanation, inputs: calc.inputs },
    }));

    /*
     * Idempotency without ON CONFLICT.
     *
     * The unique index behind this is necessarily PARTIAL - it excludes
     * reversals, because a reversal legitimately repeats its original's
     * (revenue_event_id, partner_id, kind, generation). Postgres will not match
     * a partial index from an ON CONFLICT target unless the statement repeats
     * the index predicate, which PostgREST cannot express. So the duplicate
     * check is an explicit read, with the index still standing behind it as the
     * hard backstop against a concurrent second run.
     */
    const { data: existing, error: existingError } = await supabase
      .from("abw_commission_transactions")
      .select("partner_id, kind, generation")
      .eq("revenue_event_id", event.id)
      .is("reverses_transaction_id", null);

    if (existingError) {
      return {
        eventId,
        status: "error",
        created: 0,
        skipped: [],
        message: `Could not check for existing commissions: ${existingError.message}`,
      };
    }

    const key = (r: { partner_id: string; kind: string; generation: number }) =>
      `${r.partner_id}:${r.kind}:${r.generation}`;
    const alreadyWritten = new Set((existing ?? []).map(key));
    const fresh = rows.filter((row) => !alreadyWritten.has(key(row)));

    if (fresh.length) {
      const { data: inserted, error } = await supabase
        .from("abw_commission_transactions")
        .insert(fresh)
        .select("id");

      if (error) {
        // 23505: a concurrent run won the race. For an idempotent engine that
        // is success, not failure - the commission exists either way.
        if (error.code !== "23505") {
          return {
            eventId,
            status: "error",
            created: 0,
            skipped: [],
            message: `Ledger write failed: ${error.message}`,
          };
        }
      } else {
        created = inserted?.length ?? 0;
      }
    }
  }

  await markProcessed(supabase, eventId);

  return {
    eventId,
    status: created ? "written" : "skipped",
    created,
    skipped: result.skipped.map((s) => ({ kind: s.kind, reason: s.reason })),
  };
}

async function markProcessed(supabase: Db, eventId: string) {
  await supabase
    .from("abw_revenue_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
}

/** Drain the queue of revenue events that have not been through the engine. */
export async function processUnprocessedEvents(limit = 100): Promise<ProcessOutcome[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_revenue_events")
    .select("id")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const outcomes: ProcessOutcome[] = [];
  for (const row of data ?? []) {
    outcomes.push(await processRevenueEvent(row.id as string));
  }
  return outcomes;
}

/* -------------------------------------------------------------------------- */
/*  Corrections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reverse a commission.
 *
 * Never edits the original row. Writes a mirror-image transaction that points
 * back at it, plus an adjustment record carrying the reason, and flips the
 * original's status so the dashboard shows both sides of the correction.
 */
export async function reverseCommission(
  transactionId: string,
  reason: string,
  actorUserId: string | null,
  status: "REVERSED" | "REFUNDED" | "CHARGEBACK" = "REVERSED",
): Promise<{ ok: boolean; message: string; reversalId?: string }> {
  const supabase = createAdminClient();

  const { data: original } = await supabase
    .from("abw_commission_transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();

  if (!original) return { ok: false, message: "That commission was not found." };
  if (original.reverses_transaction_id) {
    return { ok: false, message: "That entry is itself a reversal and cannot be reversed again." };
  }
  if (["REVERSED", "REFUNDED", "CHARGEBACK"].includes(original.status)) {
    return { ok: false, message: "That commission has already been reversed." };
  }

  const { data: reversal, error } = await supabase
    .from("abw_commission_transactions")
    .insert({
      partner_id: original.partner_id,
      kind: original.kind,
      generation: original.generation,
      source_partner_id: original.source_partner_id,
      customer_id: original.customer_id,
      subscription_id: original.subscription_id,
      revenue_event_id: original.revenue_event_id,
      product_id: original.product_id,
      plan_id: original.plan_id,
      plan_version_id: original.plan_version_id,
      plan_version: original.plan_version,
      plan_effective_from: original.plan_effective_from,
      commission_year: original.commission_year,
      rate_bps: original.rate_bps,
      qualifying_revenue_cents: -original.qualifying_revenue_cents,
      amount_cents: -original.amount_cents,
      currency: original.currency,
      status,
      reverses_transaction_id: original.id,
      calculation: {
        explanation: [
          `Reversal of commission ${original.id}.`,
          `Reason: ${reason}`,
          `Original amount ${original.amount_cents} reversed in full.`,
        ],
        inputs: { reverses: original.id, reason },
      },
    })
    .select("id")
    .single();

  if (error || !reversal) {
    return { ok: false, message: `Could not post the reversal: ${error?.message ?? "unknown error"}` };
  }

  await Promise.all([
    supabase
      .from("abw_commission_transactions")
      .update({ status })
      .eq("id", original.id),
    supabase.from("abw_commission_adjustments").insert({
      transaction_id: original.id,
      kind: status === "CHARGEBACK" ? "clawback" : "reversal",
      amount_cents: -original.amount_cents,
      reason,
      created_by: actorUserId,
    }),
    supabase.from("abw_audit_logs").insert({
      actor_user_id: actorUserId,
      action: "commission.reversed",
      entity_type: "commission_transaction",
      entity_id: original.id,
      before_state: { status: original.status, amount_cents: original.amount_cents },
      after_state: { status, reversal_id: reversal.id },
      reason,
    }),
  ]);

  return { ok: true, message: "Reversal posted.", reversalId: reversal.id as string };
}

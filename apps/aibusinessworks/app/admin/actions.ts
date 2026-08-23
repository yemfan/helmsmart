"use server";

import { revalidatePath } from "next/cache";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processUnprocessedEvents, reverseCommission } from "@/lib/ledger";
import { levelForCustomerCount } from "@/content/levels";

/**
 * Administrative mutations.
 *
 * Every one of these re-checks admin authority itself rather than trusting the
 * layout that rendered the form, and every one writes an audit row.
 */

async function admin() {
  const auth = await assertAdminForApi();
  if (!auth.ok) throw new Error(auth.message);
  return auth;
}

async function audit(
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason: string,
) {
  const auth = await assertAdminForApi();
  if (!auth.ok) return;
  await createAdminClient().from("abw_audit_logs").insert({
    actor_user_id: auth.userId,
    actor_email: auth.email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_state: before as never,
    after_state: after as never,
    reason,
  });
}

/* -------------------------------------------------------------------------- */
/*  Partners                                                                   */
/* -------------------------------------------------------------------------- */

export async function setPartnerStatus(formData: FormData) {
  await admin();
  const partnerId = String(formData.get("partnerId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 500);

  if (!partnerId || !["pending", "active", "suspended", "terminated"].includes(status)) return;

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from("abw_partners")
    .select("status, level_key, approved_at")
    .eq("id", partnerId)
    .maybeSingle();

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status };
  if (status === "active") {
    patch.approved_at = before?.approved_at ?? now;
    patch.suspended_at = null;
    patch.terminated_at = null;
  }
  if (status === "suspended") patch.suspended_at = now;
  if (status === "terminated") patch.terminated_at = now;

  await supabase.from("abw_partners").update(patch).eq("id", partnerId);

  await audit(
    `partner.${status}`,
    "partner",
    partnerId,
    before ?? null,
    { status },
    reason || `Status set to ${status} by an administrator.`,
  );

  revalidatePath("/admin/partners");
  revalidatePath("/admin");
}

export async function setPartnerStanding(formData: FormData) {
  await admin();
  const partnerId = String(formData.get("partnerId") ?? "");
  const goodStanding = String(formData.get("goodStanding") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").slice(0, 500);
  if (!partnerId) return;

  const supabase = createAdminClient();
  await supabase.from("abw_partners").update({ good_standing: goodStanding }).eq("id", partnerId);

  await audit(
    "partner.standing_changed",
    "partner",
    partnerId,
    { good_standing: !goodStanding },
    { good_standing: goodStanding },
    reason || "Standing changed by an administrator.",
  );

  revalidatePath("/admin/partners");
}

/**
 * Recompute recognition levels from live active-customer counts.
 *
 * Levels are display-only, so this is safe to re-run at any time; it never
 * touches a commission.
 */
export async function recalculatePartnerLevels() {
  await admin();
  const supabase = createAdminClient();

  const { data: partners } = await supabase
    .from("abw_partners")
    .select("id, level_key")
    .eq("status", "active");

  for (const partner of partners ?? []) {
    const { count } = await supabase
      .from("abw_customers")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partner.id)
      .in("status", ["trialing", "active", "past_due"]);

    const level = levelForCustomerCount(count ?? 0);
    if (level?.key !== partner.level_key) {
      await supabase
        .from("abw_partners")
        .update({ level_key: level?.key ?? null })
        .eq("id", partner.id);
    }
  }

  revalidatePath("/admin/partners");
}

/* -------------------------------------------------------------------------- */
/*  Commissions                                                                */
/* -------------------------------------------------------------------------- */

/** Run the engine over every revenue event that has not been through it. */
export async function runCommissionEngine() {
  const auth = await admin();
  const outcomes = await processUnprocessedEvents(200);
  const created = outcomes.reduce((sum, o) => sum + o.created, 0);

  await audit(
    "commission.engine_run",
    "revenue_event",
    "batch",
    null,
    { events: outcomes.length, commissionsCreated: created },
    `Commission engine run by ${auth.email}.`,
  );

  revalidatePath("/admin/commissions");
  revalidatePath("/admin");
}

export async function approveCommission(formData: FormData) {
  const auth = await admin();
  const id = String(formData.get("commissionId") ?? "");
  if (!id) return;

  const supabase = createAdminClient();
  await supabase
    .from("abw_commission_transactions")
    .update({ status: "APPROVED", approved_at: new Date().toISOString(), approved_by: auth.userId })
    .eq("id", id)
    .eq("status", "PENDING");

  await audit("commission.approved", "commission_transaction", id, { status: "PENDING" }, { status: "APPROVED" }, "Approved for payout.");
  revalidatePath("/admin/commissions");
}

export async function approveAllPendingCommissions() {
  const auth = await admin();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("abw_commission_transactions")
    .update({ status: "APPROVED", approved_at: new Date().toISOString(), approved_by: auth.userId })
    .eq("status", "PENDING")
    .gte("amount_cents", 0)
    .select("id");

  await audit(
    "commission.bulk_approved",
    "commission_transaction",
    "batch",
    null,
    { count: data?.length ?? 0 },
    "Bulk approval of pending commissions.",
  );

  revalidatePath("/admin/commissions");
}

export async function reverseCommissionAction(formData: FormData) {
  const auth = await admin();
  const id = String(formData.get("commissionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const kind = String(formData.get("kind") ?? "REVERSED");

  if (!id || !reason) return;

  await reverseCommission(
    id,
    reason,
    auth.userId,
    kind === "CHARGEBACK" ? "CHARGEBACK" : kind === "REFUNDED" ? "REFUNDED" : "REVERSED",
  );

  revalidatePath("/admin/commissions");
}

/* -------------------------------------------------------------------------- */
/*  Revenue events                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Record a billing fact by hand.
 *
 * Until a billing integration is connected, this is how revenue reaches the
 * engine. It writes to the same table a webhook would, so the engine path is
 * identical either way.
 */
export async function recordRevenueEvent(formData: FormData) {
  const auth = await admin();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const eventType = String(formData.get("eventType") ?? "renewal");
  const occurredAt = String(formData.get("occurredAt") ?? "");
  const grossDollars = Number(formData.get("grossDollars") ?? 0);
  const taxDollars = Number(formData.get("taxDollars") ?? 0);
  const discountDollars = Number(formData.get("discountDollars") ?? 0);
  const refundDollars = Number(formData.get("refundDollars") ?? 0);
  const chargebackDollars = Number(formData.get("chargebackDollars") ?? 0);
  const reference = String(formData.get("reference") ?? "").slice(0, 120);

  if (!subscriptionId || !occurredAt) return;

  const supabase = createAdminClient();
  const { data: subscription } = await supabase
    .from("abw_subscriptions")
    .select("id, customer_id, product_id, currency")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!subscription) return;

  const { data: event } = await supabase
    .from("abw_revenue_events")
    .insert({
      subscription_id: subscription.id,
      customer_id: subscription.customer_id,
      product_id: subscription.product_id,
      source: "manual",
      source_event_id: reference || `manual-${occurredAt}-${subscription.id}`,
      event_type: eventType,
      occurred_at: new Date(occurredAt).toISOString(),
      gross_cents: Math.round(grossDollars * 100),
      tax_cents: Math.round(taxDollars * 100),
      discount_cents: Math.round(discountDollars * 100),
      credit_cents: 0,
      refunded_cents: Math.round(refundDollars * 100),
      chargeback_cents: Math.round(chargebackDollars * 100),
      currency: subscription.currency ?? "USD",
      raw: { entered_by: auth.email, reference },
    })
    .select("id")
    .single();

  if (event) {
    await audit(
      "revenue_event.recorded",
      "revenue_event",
      event.id as string,
      null,
      { subscription_id: subscription.id, gross_cents: Math.round(grossDollars * 100) },
      `Manually recorded by ${auth.email}.`,
    );
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/commissions");
}

/* -------------------------------------------------------------------------- */
/*  Payouts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create a payout for one partner from their approved, unpaid commissions.
 *
 * The commissions are stamped with the payout id and moved to PAID; the ledger
 * rows themselves are otherwise untouched, so the immutability trigger permits
 * the write.
 */
export async function createPayout(formData: FormData) {
  const auth = await admin();
  const partnerId = String(formData.get("partnerId") ?? "");
  const currency = String(formData.get("currency") ?? "USD");
  if (!partnerId) return;

  const supabase = createAdminClient();
  const { data: entries } = await supabase
    .from("abw_commission_transactions")
    .select("id, amount_cents, created_at")
    .eq("partner_id", partnerId)
    .eq("status", "APPROVED")
    .eq("currency", currency)
    .is("payout_id", null);

  if (!entries?.length) return;

  const amount = entries.reduce((sum, row) => sum + (row.amount_cents as number), 0);
  if (amount <= 0) return;

  const dates = entries.map((e) => new Date(e.created_at as string).getTime());
  const periodStart = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const periodEnd = new Date(Math.max(...dates)).toISOString().slice(0, 10);

  const { data: payout } = await supabase
    .from("abw_payouts")
    .insert({
      partner_id: partnerId,
      period_start: periodStart,
      period_end: periodEnd,
      amount_cents: amount,
      currency,
      status: "approved",
    })
    .select("id")
    .single();

  if (!payout) return;

  const paidAt = new Date().toISOString();
  await supabase
    .from("abw_commission_transactions")
    .update({ status: "PAID", payout_id: payout.id, paid_at: paidAt })
    .in(
      "id",
      entries.map((e) => e.id as string),
    );

  await audit(
    "payout.created",
    "payout",
    payout.id as string,
    null,
    { partner_id: partnerId, amount_cents: amount, entries: entries.length },
    `Payout created by ${auth.email} covering ${entries.length} approved commission entries.`,
  );

  revalidatePath("/admin/payouts");
  revalidatePath("/admin/commissions");
}

/* -------------------------------------------------------------------------- */
/*  Legal content                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Publish a new version of a legal document.
 *
 * Never edits a published version. Counsel revises the text, this writes the
 * next version number, and the public page picks up whichever version is
 * published and in effect today.
 */
export async function publishLegalDocument(formData: FormData) {
  const auth = await admin();
  const key = String(formData.get("key") ?? "").slice(0, 60);
  const title = String(formData.get("title") ?? "").slice(0, 160);
  const body = String(formData.get("body") ?? "");
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").slice(0, 10);

  if (!key || !title || !body.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return;

  const supabase = createAdminClient();
  const { data: latest } = await supabase
    .from("abw_legal_documents")
    .select("version")
    .eq("key", key)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((latest?.version as number) ?? 0) + 1;

  const { data: created } = await supabase
    .from("abw_legal_documents")
    .insert({
      key,
      title,
      body_markdown: body,
      version,
      effective_from: effectiveFrom,
      published_at: new Date().toISOString(),
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (created) {
    await audit(
      "legal.published",
      "legal_document",
      created.id as string,
      { key, previous_version: latest?.version ?? null },
      { key, version, effective_from: effectiveFrom },
      `Published ${title} v${version}.`,
    );
  }

  revalidatePath("/admin/content");
  revalidatePath("/terms");
  revalidatePath("/privacy");
  revalidatePath("/marketing-guidelines");
}

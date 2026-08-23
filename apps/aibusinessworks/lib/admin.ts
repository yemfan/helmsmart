import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import type { CommissionStatus } from "@/lib/compensation/types";

/**
 * Administrative reads.
 *
 * These run with the service role and therefore bypass RLS, so every caller
 * must already have passed `requireAdmin()` (the admin layout does this for
 * every page under /admin, and `assertAdminForApi()` does it for route
 * handlers).
 */

export interface AdminOverview {
  partners: { total: number; pending: number; active: number; suspended: number };
  customers: { total: number; active: number };
  commissions: {
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    reversedCents: number;
  };
  unprocessedEvents: number;
  configured: boolean;
}

const EMPTY_OVERVIEW: AdminOverview = {
  partners: { total: 0, pending: 0, active: 0, suspended: 0 },
  customers: { total: 0, active: 0 },
  commissions: { pendingCents: 0, approvedCents: 0, paidCents: 0, reversedCents: 0 },
  unprocessedEvents: 0,
  configured: false,
};

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!hasServiceRole()) return EMPTY_OVERVIEW;
  const supabase = createAdminClient();

  const head = (table: string) => supabase.from(table).select("id", { count: "exact", head: true });

  const [total, pending, active, suspended, customersTotal, customersActive, unprocessed] =
    await Promise.all([
      head("abw_partners"),
      head("abw_partners").eq("status", "pending"),
      head("abw_partners").eq("status", "active"),
      head("abw_partners").eq("status", "suspended"),
      head("abw_customers"),
      head("abw_customers").eq("status", "active"),
      head("abw_revenue_events").is("processed_at", null),
    ]).then((results) => results.map((r) => r.count ?? 0));

  const { data: commissionRows } = await supabase
    .from("abw_commission_transactions")
    .select("amount_cents, status");

  const sum = (statuses: CommissionStatus[]) =>
    (commissionRows ?? [])
      .filter((row) => statuses.includes(row.status as CommissionStatus))
      .reduce((total, row) => total + (row.amount_cents as number), 0);

  return {
    partners: { total, pending, active, suspended },
    customers: { total: customersTotal, active: customersActive },
    commissions: {
      pendingCents: sum(["PENDING"]),
      approvedCents: sum(["APPROVED"]),
      paidCents: sum(["PAID"]),
      reversedCents: sum(["REVERSED", "REFUNDED", "CHARGEBACK"]),
    },
    unprocessedEvents: unprocessed,
    configured: true,
  };
}

export interface AdminPartnerRow {
  id: string;
  name: string;
  email: string;
  partnerCode: string;
  status: string;
  levelKey: string | null;
  sponsorName: string | null;
  country: string | null;
  businessName: string | null;
  appliedAt: string;
  goodStanding: boolean;
}

export async function listPartnersForAdmin(): Promise<AdminPartnerRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_partners")
    .select(
      "id, first_name, last_name, email, partner_code, status, level_key, country, business_name, applied_at, good_standing, sponsor_partner_id",
    )
    .order("applied_at", { ascending: false })
    .limit(500);

  const rows = data ?? [];
  const byId = new Map(rows.map((row) => [row.id as string, row]));

  return rows.map((row) => {
    const sponsor = row.sponsor_partner_id ? byId.get(row.sponsor_partner_id as string) : null;
    return {
      id: row.id as string,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email as string,
      partnerCode: row.partner_code as string,
      status: row.status as string,
      levelKey: row.level_key as string | null,
      sponsorName: sponsor ? `${sponsor.first_name} ${sponsor.last_name}` : null,
      country: row.country as string | null,
      businessName: row.business_name as string | null,
      appliedAt: row.applied_at as string,
      goodStanding: row.good_standing as boolean,
    };
  });
}

export interface AdminCommissionRow {
  id: string;
  partnerName: string;
  customerName: string | null;
  kind: string;
  generation: number;
  commissionYear: number;
  rateBps: number;
  qualifyingRevenueCents: number;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  planLabel: string;
  createdAt: string;
  isReversal: boolean;
  explanation: string[];
}

export async function listCommissionsForAdmin(limit = 200): Promise<AdminCommissionRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_commission_transactions")
    .select(
      "id, kind, generation, commission_year, rate_bps, qualifying_revenue_cents, amount_cents, currency, status, created_at, plan_version, reverses_transaction_id, calculation, abw_partners!abw_commission_transactions_partner_id_fkey(first_name, last_name), abw_customers(display_name), abw_compensation_plan_versions(label)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as RawAdminCommission[]).map((row) => {
    const partner = first(row.abw_partners);
    const calculation = (row.calculation ?? {}) as { explanation?: string[] };
    return {
      id: row.id,
      partnerName: partner ? `${partner.first_name} ${partner.last_name}` : "Unknown",
      customerName: first(row.abw_customers)?.display_name ?? null,
      kind: row.kind,
      generation: row.generation,
      commissionYear: row.commission_year,
      rateBps: row.rate_bps,
      qualifyingRevenueCents: row.qualifying_revenue_cents,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      planLabel: first(row.abw_compensation_plan_versions)?.label ?? `v${row.plan_version}`,
      createdAt: row.created_at,
      isReversal: Boolean(row.reverses_transaction_id),
      explanation: calculation.explanation ?? [],
    };
  });
}

interface RawAdminCommission {
  id: string;
  kind: string;
  generation: number;
  commission_year: number;
  rate_bps: number;
  qualifying_revenue_cents: number;
  amount_cents: number;
  currency: string;
  status: CommissionStatus;
  created_at: string;
  plan_version: number;
  reverses_transaction_id: string | null;
  calculation: unknown;
  abw_partners: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  abw_customers: { display_name: string } | { display_name: string }[] | null;
  abw_compensation_plan_versions: { label: string } | { label: string }[] | null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface CompensationChangeRow {
  id: number;
  adminEmail: string | null;
  settingPath: string;
  previousValue: string | null;
  newValue: string | null;
  summary: string;
  reason: string | null;
  createdAt: string;
}

export async function listCompensationChanges(limit = 100): Promise<CompensationChangeRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_compensation_audit_log")
    .select("id, admin_email, setting_path, previous_value, new_value, summary, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as number,
    adminEmail: row.admin_email as string | null,
    settingPath: row.setting_path as string,
    previousValue: row.previous_value as string | null,
    newValue: row.new_value as string | null,
    summary: row.summary as string,
    reason: row.reason as string | null,
    createdAt: row.created_at as string,
  }));
}

export interface AuditRow {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listAuditLog(limit = 200): Promise<AuditRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_audit_logs")
    .select("id, actor_email, action, entity_type, entity_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as number,
    actorEmail: row.actor_email as string | null,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | null,
    reason: row.reason as string | null,
    createdAt: row.created_at as string,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Customers and subscriptions                                                */
/* -------------------------------------------------------------------------- */

export interface AdminCustomerRow {
  id: string;
  displayName: string;
  company: string | null;
  email: string | null;
  status: string;
  startedAt: string;
  partnerName: string | null;
  productName: string | null;
  subscriptionId: string | null;
  planName: string | null;
  monthlyCents: number;
  currency: string;
}

export async function listCustomersForAdmin(limit = 300): Promise<AdminCustomerRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_customers")
    .select(
      "id, display_name, company, email, status, started_at, abw_partners(first_name, last_name), abw_products(name), abw_subscriptions(id, plan_name, monthly_cents, currency, status)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as RawAdminCustomer[]).map((row) => {
    const partner = first(row.abw_partners);
    const subscriptions = Array.isArray(row.abw_subscriptions)
      ? row.abw_subscriptions
      : row.abw_subscriptions
        ? [row.abw_subscriptions]
        : [];
    const subscription =
      subscriptions.find((s) => ["trialing", "active", "past_due"].includes(s.status)) ??
      subscriptions[0] ??
      null;

    return {
      id: row.id,
      displayName: row.display_name,
      company: row.company,
      email: row.email,
      status: row.status,
      startedAt: row.started_at,
      partnerName: partner ? `${partner.first_name} ${partner.last_name}` : null,
      productName: first(row.abw_products)?.name ?? null,
      subscriptionId: subscription?.id ?? null,
      planName: subscription?.plan_name ?? null,
      monthlyCents: subscription?.monthly_cents ?? 0,
      currency: subscription?.currency ?? "USD",
    };
  });
}

interface RawAdminCustomer {
  id: string;
  display_name: string;
  company: string | null;
  email: string | null;
  status: string;
  started_at: string;
  abw_partners: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  abw_products: { name: string } | { name: string }[] | null;
  abw_subscriptions:
    | { id: string; plan_name: string | null; monthly_cents: number; currency: string; status: string }[]
    | { id: string; plan_name: string | null; monthly_cents: number; currency: string; status: string }
    | null;
}

/* -------------------------------------------------------------------------- */
/*  Payouts                                                                    */
/* -------------------------------------------------------------------------- */

export interface PayableRow {
  partnerId: string;
  partnerName: string;
  currency: string;
  approvedCents: number;
  entryCount: number;
}

/** Approved, unpaid commission grouped by partner - the payout run candidates. */
export async function listPayableBalances(): Promise<PayableRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_commission_transactions")
    .select("partner_id, amount_cents, currency, abw_partners!abw_commission_transactions_partner_id_fkey(first_name, last_name)")
    .eq("status", "APPROVED")
    .is("payout_id", null);

  const byPartner = new Map<string, PayableRow>();
  for (const row of (data ?? []) as unknown as RawPayable[]) {
    const partner = first(row.abw_partners);
    const key = `${row.partner_id}:${row.currency}`;
    const existing = byPartner.get(key);
    if (existing) {
      existing.approvedCents += row.amount_cents;
      existing.entryCount += 1;
    } else {
      byPartner.set(key, {
        partnerId: row.partner_id,
        partnerName: partner ? `${partner.first_name} ${partner.last_name}` : "Unknown",
        currency: row.currency,
        approvedCents: row.amount_cents,
        entryCount: 1,
      });
    }
  }

  return [...byPartner.values()].sort((a, b) => b.approvedCents - a.approvedCents);
}

interface RawPayable {
  partner_id: string;
  amount_cents: number;
  currency: string;
  abw_partners: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

export interface PayoutRow {
  id: string;
  partnerName: string;
  amountCents: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export async function listPayouts(limit = 100): Promise<PayoutRow[]> {
  if (!hasServiceRole()) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("abw_payouts")
    .select("id, amount_cents, currency, status, period_start, period_end, created_at, abw_partners(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as RawPayout[]).map((row) => {
    const partner = first(row.abw_partners);
    return {
      id: row.id,
      partnerName: partner ? `${partner.first_name} ${partner.last_name}` : "Unknown",
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAt: row.created_at,
    };
  });
}

interface RawPayout {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
  abw_partners: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

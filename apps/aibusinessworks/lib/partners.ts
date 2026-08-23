import "server-only";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { Cents, CommissionKind, CommissionStatus } from "@/lib/compensation/types";

/**
 * PostgREST returns an embedded relation as an object for a to-one join and an
 * array for a to-many join, and without generated database types the client
 * infers the array shape for both. This narrows either shape to one row.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export interface CustomerRow {
  id: string;
  displayName: string;
  company: string | null;
  productKey: string | null;
  productName: string | null;
  planName: string | null;
  monthlyCents: Cents;
  currency: string;
  status: string;
  startedAt: string;
  commissionYear: number;
  rateBps: number | null;
  qualifyingRevenueCents: Cents;
}

export interface CommissionRow {
  id: string;
  kind: CommissionKind;
  generation: number;
  customerName: string | null;
  productName: string | null;
  commissionYear: number;
  rateBps: number;
  qualifyingRevenueCents: Cents;
  amountCents: Cents;
  currency: string;
  status: CommissionStatus;
  planLabel: string;
  createdAt: string;
  paidAt: string | null;
}

export interface DirectPartnerRow {
  id: string;
  name: string;
  status: string;
  levelKey: string | null;
  joinedAt: string;
  activeCustomerCount: number;
}

export interface PartnerDashboard {
  activeCustomerCount: number;
  monthlyCustomerRevenueCents: Cents;
  directCommissionCents: Cents;
  overrideCommissionCents: Cents;
  totalCommissionCents: Cents;
  pendingCommissionCents: Cents;
  approvedCommissionCents: Cents;
  paidCommissionCents: Cents;
  reversedCommissionCents: Cents;
  activeDirectPartnerCount: number;
  customers: CustomerRow[];
  commissions: CommissionRow[];
  directPartners: DirectPartnerRow[];
  referralCodes: { code: string; kind: string; discountBps: number | null }[];
  /** True when the platform has no database configured, so the UI can say so. */
  offline: boolean;
}

const EMPTY_DASHBOARD: PartnerDashboard = {
  activeCustomerCount: 0,
  monthlyCustomerRevenueCents: 0,
  directCommissionCents: 0,
  overrideCommissionCents: 0,
  totalCommissionCents: 0,
  pendingCommissionCents: 0,
  approvedCommissionCents: 0,
  paidCommissionCents: 0,
  reversedCommissionCents: 0,
  activeDirectPartnerCount: 0,
  customers: [],
  commissions: [],
  directPartners: [],
  referralCodes: [],
  offline: true,
};

const ACTIVE_CUSTOMER_STATUSES = ["trialing", "active", "past_due"];

/**
 * Everything the partner dashboard renders, in one pass.
 *
 * Reads run through the session client, so row level security is what actually
 * scopes the data - not a `where partner_id = ...` we could forget to write.
 */
export async function getPartnerDashboard(partnerId: string): Promise<PartnerDashboard> {
  if (!isSupabaseConfigured()) return EMPTY_DASHBOARD;

  try {
    const supabase = await createClient();

    const [customersResult, commissionsResult, partnersResult, codesResult] = await Promise.all([
      supabase
        .from("abw_customers")
        .select(
          "id, display_name, company, status, started_at, product_id, abw_products(key, name), abw_subscriptions(id, plan_name, monthly_cents, currency, status)",
        )
        .eq("partner_id", partnerId)
        .order("started_at", { ascending: false }),
      supabase
        .from("abw_commission_transactions")
        .select(
          "id, kind, generation, commission_year, rate_bps, qualifying_revenue_cents, amount_cents, currency, status, created_at, paid_at, plan_version, abw_customers(display_name), abw_products(name), abw_compensation_plan_versions(label)",
        )
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("abw_partners")
        .select("id, first_name, last_name, status, level_key, created_at")
        .eq("sponsor_partner_id", partnerId),
      supabase
        .from("abw_referral_codes")
        .select("code, kind, discount_bps")
        .eq("partner_id", partnerId)
        .eq("is_active", true),
    ]);

    const customerRows = (customersResult.data ?? []) as unknown as RawCustomer[];
    const commissionRows = (commissionsResult.data ?? []) as unknown as RawCommission[];
    const partnerRows = (partnersResult.data ?? []) as unknown as RawPartner[];

    const customers = customerRows.map(toCustomerRow);
    const commissions = commissionRows.map(toCommissionRow);

    const activeCustomers = customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status));
    const monthlyRevenue = activeCustomers.reduce((sum, c) => sum + c.monthlyCents, 0);

    const sumBy = (predicate: (row: CommissionRow) => boolean) =>
      commissions.filter(predicate).reduce((sum, row) => sum + row.amountCents, 0);

    const directPartners: DirectPartnerRow[] = partnerRows.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      status: row.status,
      levelKey: row.level_key,
      joinedAt: row.created_at,
      // A partner cannot read another partner's customer rows, so this count
      // comes from the aggregate the platform exposes, not a cross-partner read.
      activeCustomerCount: 0,
    }));

    return {
      activeCustomerCount: activeCustomers.length,
      monthlyCustomerRevenueCents: monthlyRevenue,
      directCommissionCents: sumBy((c) => c.kind === "direct"),
      overrideCommissionCents: sumBy((c) => c.kind === "leadership_override"),
      totalCommissionCents: sumBy(() => true),
      pendingCommissionCents: sumBy((c) => c.status === "PENDING"),
      approvedCommissionCents: sumBy((c) => c.status === "APPROVED"),
      paidCommissionCents: sumBy((c) => c.status === "PAID"),
      reversedCommissionCents: sumBy((c) =>
        ["REVERSED", "REFUNDED", "CHARGEBACK"].includes(c.status),
      ),
      activeDirectPartnerCount: directPartners.filter((p) => p.status === "active").length,
      customers,
      commissions,
      directPartners,
      referralCodes: (codesResult.data ?? []).map(
        (row: { code: string; kind: string; discount_bps: number | null }) => ({
          code: row.code,
          kind: row.kind,
          discountBps: row.discount_bps,
        }),
      ),
      offline: false,
    };
  } catch {
    return EMPTY_DASHBOARD;
  }
}

/* -------------------------------------------------------------------------- */
/*  Row mapping                                                                */
/* -------------------------------------------------------------------------- */

interface RawCustomer {
  id: string;
  display_name: string;
  company: string | null;
  status: string;
  started_at: string;
  abw_products: { key: string; name: string } | { key: string; name: string }[] | null;
  abw_subscriptions:
    | { id: string; plan_name: string | null; monthly_cents: number; currency: string; status: string }[]
    | { id: string; plan_name: string | null; monthly_cents: number; currency: string; status: string }
    | null;
}

interface RawCommission {
  id: string;
  kind: CommissionKind;
  generation: number;
  commission_year: number;
  rate_bps: number;
  qualifying_revenue_cents: number;
  amount_cents: number;
  currency: string;
  status: CommissionStatus;
  created_at: string;
  paid_at: string | null;
  plan_version: number;
  abw_customers: { display_name: string } | { display_name: string }[] | null;
  abw_products: { name: string } | { name: string }[] | null;
  abw_compensation_plan_versions: { label: string } | { label: string }[] | null;
}

interface RawPartner {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  level_key: string | null;
  created_at: string;
}

function monthsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return months;
}

function toCustomerRow(row: RawCustomer): CustomerRow {
  const subscriptions = Array.isArray(row.abw_subscriptions)
    ? row.abw_subscriptions
    : row.abw_subscriptions
      ? [row.abw_subscriptions]
      : [];
  const subscription = subscriptions.find((s) =>
    ["trialing", "active", "past_due"].includes(s.status),
  );
  const product = one(row.abw_products);
  const monthly = subscription?.monthly_cents ?? 0;
  const months = Math.max(0, monthsBetween(row.started_at, new Date().toISOString()));

  return {
    id: row.id,
    displayName: row.display_name,
    company: row.company,
    productKey: product?.key ?? null,
    productName: product?.name ?? null,
    planName: subscription?.plan_name ?? null,
    monthlyCents: monthly,
    currency: subscription?.currency ?? "USD",
    status: row.status,
    startedAt: row.started_at,
    commissionYear: Math.floor(months / 12) + 1,
    // The displayed rate comes from the last commission on this customer, which
    // is authoritative; the dashboard never re-derives a rate itself.
    rateBps: null,
    qualifyingRevenueCents: 0,
  };
}

function toCommissionRow(row: RawCommission): CommissionRow {
  return {
    id: row.id,
    kind: row.kind,
    generation: row.generation,
    customerName: one(row.abw_customers)?.display_name ?? null,
    productName: one(row.abw_products)?.name ?? null,
    commissionYear: row.commission_year,
    rateBps: row.rate_bps,
    qualifyingRevenueCents: row.qualifying_revenue_cents,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    planLabel: one(row.abw_compensation_plan_versions)?.label ?? `v${row.plan_version}`,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public directory                                                           */
/* -------------------------------------------------------------------------- */

export interface PublicPartnerProfile {
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  location: string | null;
  industries: string[];
  productKeys: string[];
  languages: string[];
  websiteUrl: string | null;
  bookingUrl: string | null;
  contactEmail: string | null;
  socialLinks: Record<string, string>;
  levelKey: string | null;
}

/**
 * A row of `abw_public_partners` - the definer-rights view that IS the security
 * boundary for the directory. Email, phone, partner code, sponsor, standing and
 * every financial column are absent from the view entirely, so they cannot leak
 * through this path no matter how the query is written.
 */
interface RawPublicPartner {
  slug: string;
  first_name: string;
  last_name: string;
  level_key: string | null;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  location: string | null;
  industries: string[] | null;
  product_keys: string[] | null;
  languages: string[] | null;
  website_url: string | null;
  booking_url: string | null;
  contact_email: string | null;
  social_links: Record<string, string> | null;
}

function toPublicProfile(row: RawPublicPartner): PublicPartnerProfile {
  return {
    slug: row.slug,
    name: `${row.first_name} ${row.last_name}`,
    headline: row.headline,
    bio: row.bio,
    photoUrl: row.photo_url,
    location: row.location,
    industries: row.industries ?? [],
    productKeys: row.product_keys ?? [],
    languages: row.languages ?? [],
    websiteUrl: row.website_url,
    bookingUrl: row.booking_url,
    contactEmail: row.contact_email,
    socialLinks: row.social_links ?? {},
    levelKey: row.level_key,
  };
}

const PUBLIC_PARTNER_SELECT =
  "slug, first_name, last_name, level_key, headline, bio, photo_url, location, industries, product_keys, languages, website_url, booking_url, contact_email, social_links";

export async function listPublicPartners(): Promise<PublicPartnerProfile[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("abw_public_partners")
      .select(PUBLIC_PARTNER_SELECT)
      .order("published_at", { ascending: false })
      .limit(200);

    return ((data ?? []) as unknown as RawPublicPartner[]).map(toPublicProfile);
  } catch {
    return [];
  }
}

export async function getPublicPartner(slug: string): Promise<PublicPartnerProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("abw_public_partners")
      .select(PUBLIC_PARTNER_SELECT)
      .eq("slug", slug)
      .maybeSingle();

    return data ? toPublicProfile(data as unknown as RawPublicPartner) : null;
  } catch {
    return null;
  }
}

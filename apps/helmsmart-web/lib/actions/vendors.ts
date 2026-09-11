"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertVendor, updateVendor as updateVendorFinance, deleteVendor as deleteVendorFinance } from "@helm/dna-finance";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type Vendor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_1099: boolean;
  created_at: string;
};

export type VendorWithSpend = Vendor & {
  totalBilled: number; // all bills matching this vendor name
  totalPaid: number;   // paid bills only
  openAmount: number;  // open bills only
  openCount: number;
  billCount: number;
};

async function getOrgId(): Promise<string | null> {
  return getMemberOrgId();
}

/** Vendors with spend matched from bills by (case-insensitive) name. */
export async function listVendorsWithSpend(): Promise<VendorWithSpend[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();

  const [vendorsRes, billsRes] = await Promise.all([
    supabase.from("vendors").select("*").eq("organization_id", orgId).order("name"),
    supabase.from("bills").select("vendor, amount, status").eq("organization_id", orgId),
  ]);

  type Spend = { billed: number; paid: number; openAmount: number; openCount: number; count: number };
  const spend = new Map<string, Spend>();
  for (const b of billsRes.data ?? []) {
    const key = (b.vendor ?? "").trim().toLowerCase();
    if (!key) continue;
    const s = spend.get(key) ?? { billed: 0, paid: 0, openAmount: 0, openCount: 0, count: 0 };
    const amt = Number(b.amount) || 0;
    s.billed += amt;
    s.count += 1;
    if (b.status === "paid") {
      s.paid += amt;
    } else {
      s.openAmount += amt;
      s.openCount += 1;
    }
    spend.set(key, s);
  }

  return (vendorsRes.data ?? []).map((v) => {
    const s = spend.get((v.name ?? "").trim().toLowerCase());
    return {
      ...v,
      totalBilled: s?.billed ?? 0,
      totalPaid: s?.paid ?? 0,
      openAmount: s?.openAmount ?? 0,
      openCount: s?.openCount ?? 0,
      billCount: s?.count ?? 0,
    };
  }) as VendorWithSpend[];
}

/** Just the names — for the bill-form autocomplete datalist. */
export async function listVendorNames(): Promise<string[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("name")
    .eq("organization_id", orgId)
    .order("name");
  return (data ?? []).map((v) => v.name as string);
}

export async function createVendor(input: {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is1099: boolean;
}): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("vendors.errors.noOrg"));

  const supabase = await createClient();
  await insertVendor(supabase, orgId, input);
  revalidatePath("/books/vendors");
}

export async function updateVendor(
  id: string,
  input: { name: string; email: string | null; phone: string | null; notes: string | null; is1099: boolean }
): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("vendors.errors.noOrg"));

  const supabase = await createClient();
  await updateVendorFinance(supabase, orgId, id, input);
  revalidatePath("/books/vendors");
}

// ─── 1099 year-end report (Week 47) ───────────────────────────────────────────

export type Vendor1099Row = {
  id: string;
  name: string;
  email: string | null;
  paidThisYear: number;
  meetsThreshold: boolean; // >= $600 IRS reporting threshold
};

export type Report1099 = {
  year: number;
  rows: Vendor1099Row[];
  totalPaid: number;
  reportableCount: number;
};

/** Per-1099-vendor total PAID within the tax year (bills matched by name). */
export async function get1099Report(year: number): Promise<Report1099> {
  const orgId = await getOrgId();
  if (!orgId) return { year, rows: [], totalPaid: 0, reportableCount: 0 };

  const supabase = await createClient();
  const from = `${year}-01-01T00:00:00`;
  const to = `${year}-12-31T23:59:59.999Z`;

  const [vendorsRes, billsRes] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, is_1099")
      .eq("organization_id", orgId)
      .eq("is_1099", true)
      .order("name"),
    supabase
      .from("bills")
      .select("vendor, amount, status, paid_at")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .gte("paid_at", from)
      .lte("paid_at", to),
  ]);

  const paid = new Map<string, number>();
  for (const b of billsRes.data ?? []) {
    const key = (b.vendor ?? "").trim().toLowerCase();
    if (!key) continue;
    paid.set(key, (paid.get(key) ?? 0) + (Number(b.amount) || 0));
  }

  const rows: Vendor1099Row[] = (vendorsRes.data ?? [])
    .map((v) => {
      const amt = paid.get((v.name ?? "").trim().toLowerCase()) ?? 0;
      return { id: v.id, name: v.name, email: v.email, paidThisYear: amt, meetsThreshold: amt >= 600 };
    })
    .sort((a, b) => b.paidThisYear - a.paidThisYear);

  const totalPaid = rows.reduce((s, r) => s + r.paidThisYear, 0);
  const reportableCount = rows.filter((r) => r.meetsThreshold).length;

  return { year, rows, totalPaid, reportableCount };
}

export async function deleteVendor(id: string): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("vendors.errors.noOrg"));
  const supabase = await createClient();
  await deleteVendorFinance(supabase, orgId, id);
  revalidatePath("/books/vendors");
}

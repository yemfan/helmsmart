"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "annually";

export type RecurringBill = {
  id: string;
  vendor: string;
  description: string | null;
  expense_account_id: string | null;
  amount: number;
  due_days: number;
  frequency: RecurringFrequency;
  next_run_date: string;
  status: "active" | "paused";
  last_generated_at: string | null;
  expense_account?: { name: string; code: string } | null;
};

async function getOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("helmsmart-org-id")?.value ?? null;
}

export async function listRecurringBills(): Promise<RecurringBill[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_bills")
    .select(
      "id, vendor, description, expense_account_id, amount, due_days, frequency, next_run_date, status, last_generated_at, expense_account:expense_account_id(name, code)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount),
    expense_account:
      (Array.isArray(r.expense_account) ? r.expense_account[0] : r.expense_account) ?? null,
  })) as RecurringBill[];
}

export async function createRecurringBill(data: {
  vendor: string;
  description: string | null;
  expenseAccountId: string | null;
  amount: number;
  dueDays: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
}): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));
  if (!data.vendor.trim()) throw new Error(t("bills.errors.vendorRequired"));
  if (!data.amount || data.amount <= 0) throw new Error(t("bills.errors.invalidAmount"));
  if (!data.nextRunDate) throw new Error(t("bills.errors.firstRunDateRequired"));

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_bills").insert({
    organization_id: orgId,
    vendor: data.vendor.trim(),
    description: data.description,
    expense_account_id: data.expenseAccountId,
    amount: data.amount,
    due_days: data.dueDays,
    frequency: data.frequency,
    next_run_date: data.nextRunDate,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/books/bills/recurring");
}

export async function setRecurringBillStatus(
  id: string,
  status: "active" | "paused"
): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_bills")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/books/bills/recurring");
}

export async function deleteRecurringBill(id: string): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_bills")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/books/bills/recurring");
}

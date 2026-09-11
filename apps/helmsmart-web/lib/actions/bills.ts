"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertBill, recordBillPayment } from "@helm/dna-finance";
import { checkActionPermission } from "@/components/role-guard";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type BillStatus = "open" | "paid";

export interface Bill {
  id: string;
  vendor: string;
  description: string | null;
  bill_number: string | null;
  expense_account_id: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  status: BillStatus;
  paid_at: string | null;
  paid_bank_account_id: string | null;
  journal_entry_id: string | null;
  created_at: string;
  expense_account?: { name: string; code: string } | null;
}

async function getOrgId(): Promise<string | null> {
  return getMemberOrgId();
}

export async function listBills(): Promise<Bill[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bills")
    .select(
      "id, vendor, description, bill_number, expense_account_id, issue_date, due_date, amount, status, paid_at, paid_bank_account_id, journal_entry_id, created_at, expense_account:expense_account_id(name, code)"
    )
    .eq("organization_id", orgId)
    .order("status", { ascending: true }) // 'open' sorts before 'paid'
    .order("due_date", { ascending: true });

  return (data ?? []).map((b) => ({
    ...b,
    amount: Number(b.amount),
    expense_account:
      (Array.isArray(b.expense_account) ? b.expense_account[0] : b.expense_account) ?? null,
  })) as Bill[];
}

export async function createBill(input: {
  vendor: string;
  description: string | null;
  billNumber: string | null;
  expenseAccountId: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
}): Promise<void> {
  const t = await getServerT("books");
  const denied = await checkActionPermission("books.write");
  if (denied) throw new Error(denied.error);
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));
  const supabase = await createClient();
  await insertBill(supabase, orgId, input);
  revalidatePath("/books/bills");
}

/**
 * Pay a bill: post the expense journal entry (DR expense / CR bank) — this is
 * where the expense is recognized on a cash basis — and mark the bill paid.
 */
export async function payBill(input: {
  billId: string;
  bankAccountId: string;
  paymentDate: string;
}): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));

  const supabase = await createClient();
  await recordBillPayment(supabase, orgId, input);

  revalidatePath("/books/bills");
  revalidatePath("/books/expenses");
  revalidatePath("/books/journal");
  revalidatePath("/books/reports");
  revalidatePath("/books");
  revalidatePath("/reports");
}

export async function deleteBill(id: string): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("bills.errors.noOrg"));
  const supabase = await createClient();

  // Paid bills have a posted journal entry — don't allow silent deletion.
  const { data: bill } = await supabase
    .from("bills")
    .select("status")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (!bill) throw new Error(t("bills.errors.notFound"));
  if (bill.status === "paid") throw new Error(t("bills.errors.cantDeletePaid"));

  await supabase.from("bills").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/books/bills");
}

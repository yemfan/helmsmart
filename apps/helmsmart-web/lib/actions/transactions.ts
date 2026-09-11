"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { postTransaction } from "@/lib/actions/ledger";
import { normalizePayee } from "@/lib/payee";
import { getServerT } from "@/lib/i18n/server";
import { checkActionPermission } from "@/components/role-guard";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type ApproveState = { error?: string; success?: boolean } | null;

/**
 * Who may review bank transactions, and in which org.
 *
 * Approving posts to the books and skipping takes a line out of the review
 * queue, so both need `books.write` — a viewer can read the ledger but not
 * change it. The org is the ACTIVE one: RLS alone would let someone who is a
 * viewer here and an admin elsewhere approve this org's transactions while
 * working in the other one.
 */
async function reviewAccess(
  t: Awaited<ReturnType<typeof getServerT>>
): Promise<{ orgId: string } | { error: string }> {
  const denied = await checkActionPermission("books.write");
  if (denied) return { error: denied.error };
  const orgId = await getMemberOrgId();
  if (!orgId) return { error: t("orgAccess.noOrg", { ns: "common" }) };
  return { orgId };
}

/**
 * Approve a transaction: mark it reviewed, optionally override the CoA account,
 * then post it to the double-entry journal.
 */
export async function approveTransaction(
  _: ApproveState,
  formData: FormData
): Promise<ApproveState> {
  const transactionId = formData.get("transaction_id") as string;
  const coaAccountId = formData.get("coa_account_id") as string | null;
  const memo = (formData.get("memo") as string)?.trim() || null;

  const t = await getServerT("books");

  if (!transactionId) return { error: t("transactions.errors.missingId") };

  const access = await reviewAccess(t);
  if ("error" in access) return { error: access.error };

  const supabase = await createClient();

  // Update the transaction
  const update: Record<string, unknown> = { reviewed: true, memo };
  if (coaAccountId) update.coa_account_id = coaAccountId;

  // Ask for the row back: an update RLS refuses matches zero rows and is not
  // an error, and "approved" over an unchanged row would be a lie.
  const { data: updated, error: updateError } = await supabase
    .from("bank_transactions")
    .update(update)
    .eq("id", transactionId)
    .eq("organization_id", access.orgId)
    .select("id");

  if (updateError) return { error: t("transactions.errors.approveFailed") };
  if (!updated || updated.length === 0) return { error: t("transactions.errors.notFound") };

  // Remember this payee → category so the same vendor auto-categorizes next time
  // (and a correction overwrites the old mapping).
  if (coaAccountId) {
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("organization_id, merchant_name, name")
      .eq("id", transactionId)
      .single();
    const key = txn ? normalizePayee(txn.merchant_name ?? txn.name) : "";
    if (txn && key) {
      await supabase.from("payee_categories").upsert(
        { organization_id: txn.organization_id, payee_key: key, coa_account_id: coaAccountId },
        { onConflict: "organization_id,payee_key" }
      );
    }
  }

  // Post to journal (non-fatal if it fails — transaction is still marked reviewed)
  await postTransaction(transactionId).catch((e) =>
    console.warn("[approve] journal posting failed:", e)
  );

  revalidatePath("/books/transactions");
  return { success: true };
}

/**
 * Skip a transaction (mark reviewed without categorizing or posting to journal).
 * Useful for transfers, personal expenses, etc.
 */
export async function skipTransaction(transactionId: string): Promise<{ error?: string }> {
  const t = await getServerT("books");

  const access = await reviewAccess(t);
  if ("error" in access) return { error: access.error };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("bank_transactions")
    .update({ reviewed: true, memo: "[Skipped]" })
    .eq("id", transactionId)
    .eq("organization_id", access.orgId)
    .select("id");

  if (error) return { error: t("transactions.errors.skipFailed") };
  if (!updated || updated.length === 0) return { error: t("transactions.errors.notFound") };

  revalidatePath("/books/transactions");
  return {};
}

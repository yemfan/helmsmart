"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { postTransaction } from "@/lib/actions/ledger";
import { normalizePayee } from "@/lib/payee";
import { getServerT } from "@/lib/i18n/server";

export type ApproveState = { error?: string; success?: boolean } | null;

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized", { ns: "common" }) };

  // Update the transaction
  const update: Record<string, unknown> = { reviewed: true, memo };
  if (coaAccountId) update.coa_account_id = coaAccountId;

  const { error: updateError } = await supabase
    .from("bank_transactions")
    .update(update)
    .eq("id", transactionId);

  if (updateError) return { error: t("transactions.errors.approveFailed") };

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized", { ns: "common" }) };

  const { error } = await supabase
    .from("bank_transactions")
    .update({ reviewed: true, memo: "[Skipped]" })
    .eq("id", transactionId);

  if (error) return { error: t("transactions.errors.skipFailed") };

  revalidatePath("/books/transactions");
  return {};
}

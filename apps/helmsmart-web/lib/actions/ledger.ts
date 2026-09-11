"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { postBankTransaction, reverseJournalEntry as reverseEntry } from "@helm/dna-finance";
import { requireMemberOf, requireOrgMember } from "@/lib/auth/org-context";
import { getServerT } from "@/lib/i18n/server";

// Double-entry posting/reversal logic lives in @helm/dna-finance (Finance DNA).
// These server actions own the service-role client + the "use server" boundary
// — which makes each one callable on its own, with any arguments. So each
// checks membership, and scopes what it touches to the caller's org, before
// the RLS-bypass client does anything.

/** Post an approved bank_transaction to the double-entry journal (cash-basis). */
export async function postTransaction(transactionId: string): Promise<{ error?: string }> {
  const access = await requireOrgMember();
  if (!access.ok) return { error: access.error };

  const db = await createServiceClient();
  // postBankTransaction looks the transaction up by id alone; make sure it is
  // one of this org's before it is posted to this org's books.
  const { data: txn } = await db
    .from("bank_transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("organization_id", access.orgId)
    .maybeSingle();
  if (!txn) return { error: (await getServerT("common"))("orgAccess.notMember") };

  return postBankTransaction(db, transactionId);
}

/** Reverse a posted journal entry (creates a reversing entry with debits/credits swapped). */
export async function reverseJournalEntry(
  journalEntryId: string,
  orgId: string
): Promise<{ error?: string }> {
  const access = await requireMemberOf(orgId);
  if (!access.ok) return { error: access.error };
  return reverseEntry(await createServiceClient(), journalEntryId, access.orgId);
}

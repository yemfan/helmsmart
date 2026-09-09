import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CURRENCY } from "@/lib/books-format";

/**
 * The organization's ISO currency code — `organizations.currency`, which the
 * schema defaults to `'USD'`.
 *
 * Books screens format money for the org that owns the ledger, not for the
 * reader's country: a Canadian contractor's invoice totals stay CAD when the
 * dashboard is switched to Chinese. The locale decides grouping, separators
 * and symbol placement; this decides the symbol.
 *
 * Falls back to USD when the cookie has no org, the row is unreadable, or the
 * column is null — a missing currency must never make the page throw.
 */
export async function orgCurrency(orgId?: string): Promise<string> {
  let id = orgId;
  if (!id) {
    const cookieStore = await cookies();
    id = cookieStore.get("helmsmart-org-id")?.value ?? "";
  }
  if (!id) return DEFAULT_CURRENCY;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("currency")
      .eq("id", id)
      .maybeSingle();
    return (data?.currency as string | null) || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

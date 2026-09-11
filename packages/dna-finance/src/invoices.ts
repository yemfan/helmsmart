import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";
import { computeTotals, formatDocNumber } from "./money";

type Db = SupabaseClient<Database>;

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  coa_account_id?: string | null;
  sort_order?: number;
}

export interface CreateInvoiceInput {
  clientId: string | null;
  /**
   * `YYYY-MM-DD` in the org's timezone. Pass it: the UTC fallback is already
   * tomorrow for a US business every evening.
   */
  issueDate?: string;
  dueDate: string;
  taxRate: number;
  notes: string;
  lines: InvoiceLineInput[];
}

/** Next sequential invoice number for an org, e.g. "INV-0007". Org-scoped (RLS-enforced). */
export async function nextInvoiceNumber(db: Db, orgId: string): Promise<string> {
  const { count } = await db
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return formatDocNumber("INV", (count ?? 0) + 1);
}

/**
 * Insert an invoice and its line items. Pure persistence — NO email, notifications,
 * automations, or revalidation (those belong to the app's server-action wrapper).
 * Returns the new invoice id.
 */
export async function insertInvoiceWithLines(
  db: Db,
  orgId: string,
  input: CreateInvoiceInput
): Promise<string> {
  const { subtotal, taxAmount, total } = computeTotals(input.lines, input.taxRate);
  const invoiceNumber = await nextInvoiceNumber(db, orgId);

  const { data: inv, error } = await db
    .from("invoices")
    .insert({
      organization_id: orgId,
      client_id: input.clientId || null,
      invoice_number: invoiceNumber,
      status: "draft",
      issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
      due_date: input.dueDate,
      subtotal,
      tax_rate: input.taxRate,
      tax_amount: taxAmount,
      total,
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !inv) throw new Error(error?.message ?? "Failed to create invoice");

  if (input.lines.length > 0) {
    await db.from("invoice_lines").insert(
      input.lines.map((l, i) => ({
        invoice_id: inv.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
        coa_account_id: l.coa_account_id ?? null,
        sort_order: i,
      }))
    );
  }

  return inv.id;
}

/** List an org's invoices, newest first. */
export async function listInvoices(db: Db, orgId: string) {
  const { data, error } = await db
    .from("invoices")
    .select("*")
    .eq("organization_id", orgId)
    .order("issue_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

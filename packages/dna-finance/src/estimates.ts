import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";
import { computeTotals, formatDocNumber } from "./money";
import { insertInvoiceWithLines } from "./invoices";

type Db = SupabaseClient<Database>;

export interface EstimateLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order?: number;
}

export interface CreateEstimateInput {
  clientId: string | null;
  /** `YYYY-MM-DD` in the org's timezone; falls back to the UTC date. */
  issueDate?: string;
  expiryDate: string;
  taxRate: number;
  notes: string;
  lines: EstimateLineInput[];
}

/** Next sequential estimate number for an org, e.g. "EST-0007". */
export async function nextEstimateNumber(db: Db, orgId: string): Promise<string> {
  const { count } = await db
    .from("estimates")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return formatDocNumber("EST", (count ?? 0) + 1);
}

/** Insert an estimate + its line items (pure persistence; caller revalidates). Returns the new id. */
export async function insertEstimateWithLines(
  db: Db,
  orgId: string,
  input: CreateEstimateInput
): Promise<string> {
  const { subtotal, taxAmount, total } = computeTotals(input.lines, input.taxRate);
  const estimateNumber = await nextEstimateNumber(db, orgId);

  const { data: est, error } = await db
    .from("estimates")
    .insert({
      organization_id: orgId,
      client_id: input.clientId || null,
      estimate_number: estimateNumber,
      status: "draft",
      issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
      expiry_date: input.expiryDate,
      subtotal,
      tax_rate: input.taxRate,
      tax_amount: taxAmount,
      total,
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !est) throw new Error(error?.message ?? "Failed to create estimate");

  if (input.lines.length > 0) {
    await db.from("estimate_lines").insert(
      input.lines.map((l, i) => ({
        estimate_id: est.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
        sort_order: i,
      }))
    );
  }

  return est.id;
}

/** Update an estimate's lifecycle status. Org-scoped. */
export async function setEstimateStatus(
  db: Db,
  orgId: string,
  estimateId: string,
  status: "accepted" | "declined" | "expired"
): Promise<void> {
  await db
    .from("estimates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", estimateId)
    .eq("organization_id", orgId);
}

/**
 * Convert an estimate into a draft invoice: copies the line items, links the two
 * records (`estimates.converted_invoice_id`), and marks the estimate accepted.
 * Pure persistence — the caller owns notifications / revalidation / email.
 *
 * Idempotent: if the estimate already has a `converted_invoice_id`, returns it
 * without creating a duplicate (so the public accept route and the owner's
 * manual button can't race into two invoices).
 */
export async function convertEstimateToInvoice(
  db: Db,
  orgId: string,
  estimateId: string,
  opts?: {
    dueInDays?: number;
    /** `YYYY-MM-DD` in the org's timezone — the issue date, and the base for the due date. */
    today?: string;
  }
): Promise<{ invoiceId: string; alreadyConverted: boolean }> {
  const { data: est, error } = await db
    .from("estimates")
    .select(
      "id, client_id, tax_rate, notes, converted_invoice_id, estimate_lines(description, quantity, unit_price, amount, sort_order)"
    )
    .eq("id", estimateId)
    .eq("organization_id", orgId)
    .single();

  if (error || !est) throw new Error(error?.message ?? "Estimate not found");
  if (est.converted_invoice_id) {
    return { invoiceId: est.converted_invoice_id as string, alreadyConverted: true };
  }

  const rawLines = Array.isArray(est.estimate_lines) ? est.estimate_lines : [];
  const lines = [...rawLines]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      amount: Number(l.amount),
    }));

  // Calendar math on the date string: `setDate` on a Date and then
  // `toISOString()` lands a day off anywhere that is not UTC.
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (opts?.dueInDays ?? 30));
  const dueDate = due.toISOString().slice(0, 10);

  const invoiceId = await insertInvoiceWithLines(db, orgId, {
    clientId: (est.client_id as string | null) ?? null,
    issueDate: today,
    dueDate,
    taxRate: Number(est.tax_rate),
    notes: (est.notes as string | null) ?? "",
    lines,
  });

  await db
    .from("estimates")
    .update({
      status: "accepted",
      converted_invoice_id: invoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", estimateId)
    .eq("organization_id", orgId);

  return { invoiceId, alreadyConverted: false };
}

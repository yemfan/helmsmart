"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateRecurringInput {
  client_id: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annually";
  next_invoice_date: string;
  title: string;
  notes?: string;
  tax_rate: number; // 0–1 (e.g. 0.0875)
  line_items: RecurringLineItem[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecurringInvoice(input: CreateRecurringInput) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("books"))("errors.notAuthenticated"));

  const supabase = await createClient();

  const { error } = await supabase.from("recurring_invoices").insert({
    organization_id: orgId,
    client_id: input.client_id || null,
    frequency: input.frequency,
    next_invoice_date: input.next_invoice_date,
    title: input.title || "Recurring Invoice",
    notes: input.notes ?? null,
    tax_rate: input.tax_rate,
    line_items: input.line_items,
    status: "active",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/books/invoices/recurring");
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────

export async function setRecurringStatus(
  id: string,
  newStatus: "active" | "paused"
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("books"))("errors.notAuthenticated"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_invoices")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/books/invoices/recurring");
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecurringInvoice(id: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("books"))("errors.notAuthenticated"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_invoices")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/books/invoices/recurring");
}

/**
 * GET /api/cron/invoices/recurring
 *
 * Cron handler — runs daily at 09:05 UTC (after the overdue cron).
 * Finds all active recurring_invoices whose next_invoice_date <= today,
 * generates a draft invoice for each, then advances next_invoice_date.
 *
 * Protected by CRON_SECRET bearer token (set in Vercel env vars).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { advanceByFrequency, latestCalendarDate } from "@/lib/org-date";
import { orgTodays } from "@/lib/org-timezone";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

// ─── Invoice number ───────────────────────────────────────────────────────────

async function nextInvoiceNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<string> {
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const n = (count ?? 0) + 1;
  return `INV-${String(n).padStart(4, "0")}`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Due, and issued, by each org's own date — not the server's. The query takes
  // the latest date any zone can be on; the filter below holds each row to its org.
  const now = new Date();
  const horizon = latestCalendarDate(now);
  let processed = 0;
  let generated = 0;
  const errors: string[] = [];

  // Process every vertical's orgs — Core plus the medical project (if configured).
  for (const conn of packServiceConns()) {
    const supabase = createServiceClientFor(conn);

    // Find all active recurring invoices due today or earlier
    const { data: due, error: fetchErr } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("status", "active")
      .lte("next_invoice_date", horizon);

    if (fetchErr) {
      errors.push(fetchErr.message);
      continue;
    }
    const todayOf = await orgTodays(supabase, (due ?? []).map((r) => r.organization_id as string), now);
    const ready = (due ?? []).filter(
      (r) => (r.next_invoice_date as string) <= todayOf(r.organization_id as string)
    );
    processed += ready.length;

    for (const rec of ready) {
      try {
        const items = (rec.line_items as LineItem[]) ?? [];
        if (!items.length) continue;

        const subtotal = items.reduce(
          (s: number, i: LineItem) => s + Number(i.quantity) * Number(i.unit_price),
          0
        );
        const taxRate = Number(rec.tax_rate);
        const taxAmount = +(subtotal * taxRate).toFixed(2);
        const total = +(subtotal + taxAmount).toFixed(2);

        const dueDate = advanceByFrequency(rec.next_invoice_date, rec.frequency);
        const invoiceNumber = await nextInvoiceNumber(supabase, rec.organization_id);

        // Insert invoice
        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .insert({
            organization_id: rec.organization_id,
            client_id: rec.client_id ?? null,
            invoice_number: invoiceNumber,
            status: "draft",
            issue_date: todayOf(rec.organization_id as string),
            due_date: dueDate,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total,
            notes: rec.notes ?? null,
          })
          .select("id")
          .single();

        if (invErr || !inv) throw new Error(invErr?.message ?? "Insert failed");

        // Insert line items
        if (items.length > 0) {
          await supabase.from("invoice_lines").insert(
            items.map((item: LineItem, idx: number) => ({
              invoice_id: inv.id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              amount: +(Number(item.quantity) * Number(item.unit_price)).toFixed(2),
              sort_order: idx,
            }))
          );
        }

        // Advance schedule + record last generated
        await supabase
          .from("recurring_invoices")
          .update({
            next_invoice_date: dueDate,
            last_generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", rec.id);

        generated++;
      } catch (err) {
        errors.push(
          `rec ${rec.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    generated,
    errors,
  });
}

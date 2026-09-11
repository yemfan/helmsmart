/**
 * POST /api/cron/invoices/overdue
 *
 * Marks sent invoices whose due_date has passed as "overdue" and fires
 * invoice_overdue notifications. Called daily by Vercel Cron. Iterates every
 * vertical (Core + medical, …) so each project's invoices are processed.
 *
 * Auth: Bearer token via CRON_SECRET env var (Vercel sets this automatically
 * when crons are configured in vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { createNotificationService } from "@/lib/notifications-service";
import { runAutomations } from "@/lib/automation-engine";
import { DEFAULT_CURRENCY, money } from "@/lib/books-format";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret (or CRON_SECRET env)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let processed = 0;
  const errors: string[] = [];

  // Process every vertical's orgs — Core plus the medical project (if configured).
  for (const conn of packServiceConns()) {
    const supabase = createServiceClientFor(conn);

    // Find all sent invoices past their due date
    const { data: overdueInvoices, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, organization_id, clients(first_name, last_name, company)")
      .eq("status", "sent")
      .lt("due_date", today);

    if (error) {
      errors.push(error.message);
      continue;
    }
    if (!overdueInvoices?.length) continue;

    // Mark all as overdue in one update
    const ids = overdueInvoices.map((i) => i.id);
    await supabase
      .from("invoices")
      .update({ status: "overdue", updated_at: new Date().toISOString() })
      .in("id", ids);

    /*
     * The amount goes into the notification as a formatted STRING, because the
     * reader's language decides the sentence and the org's ledger decides the
     * currency — and only this side knows the second one. One query for the
     * whole batch; a missing row means USD, the column's own default.
     */
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, currency")
      .in("id", [...new Set(overdueInvoices.map((i) => i.organization_id))]);
    const currencyOf = new Map(
      (orgs ?? []).map((o) => [o.id as string, (o.currency as string | null) || DEFAULT_CURRENCY]),
    );

    // Fire one notification per invoice
    for (const inv of overdueInvoices) {
      const clientRaw = inv.clients;
      const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
        first_name: string | null; last_name: string | null; company: string | null;
      } | null;
      const clientLabel = client
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || ""
        : "";
      const clientName = clientLabel || "a client";

      // Grouping and symbol placement are English because nothing here knows
      // who will open the bell; the CURRENCY is the org's, which is the half
      // that was actually wrong before (every total was labelled in dollars).
      const amount = money(
        Number(inv.total),
        "en",
        currencyOf.get(inv.organization_id) ?? DEFAULT_CURRENCY,
      );

      await createNotificationService(
        inv.organization_id,
        {
          type: "invoice_overdue",
          title: `Invoice overdue: ${amount}`,
          body: `Invoice ${inv.invoice_number} from ${clientName} is past due`,
          titleKey: "notifications.events.invoiceOverdue",
          // "a client" is English copy, not data — an invoice with no client
          // gets the sentence that does not name one rather than that phrase
          // dropped into a Spanish slot.
          bodyKey: clientLabel
            ? "notifications.events.invoiceOverdueBody"
            : "notifications.events.invoiceOverdueBodyNoClient",
          params: { amount, number: inv.invoice_number, client: clientLabel },
          link: `/books/invoices/${inv.id}`,
        },
        supabase
      );

      await runAutomations(
        "invoice_overdue",
        {
          orgId: inv.organization_id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          amount: Number(inv.total),
          clientName,
        },
        supabase
      );
    }
    processed += overdueInvoices.length;
  }

  return NextResponse.json({ processed, errors });
}

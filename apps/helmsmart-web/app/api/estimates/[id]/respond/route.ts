/**
 * POST /api/estimates/[id]/respond
 *
 * Public endpoint — no auth required (UUID is capability token).
 * Accepts { status: "accepted" | "declined" } and updates the estimate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { convertEstimateToInvoice } from "@helm/dna-finance";
import { createNotificationService } from "@/lib/notifications-service";
import { calendarDate } from "@/lib/org-date";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let status: string;
  try {
    const body = await request.json();
    status = body.status;
    if (!["accepted", "declined"].includes(status)) {
      return new NextResponse("Invalid status", { status: 400 });
    }
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const supabase = await createServiceClient();

  // Verify estimate exists and is in a respondable state
  const { data: est } = await supabase
    .from("estimates")
    .select("id, organization_id, estimate_number, status, expiry_date, organizations(timezone)")
    .eq("id", id)
    .single();

  if (!est) return new NextResponse("Not found", { status: 404 });

  // The business's date decides expiry, and is the issue date of the invoice
  // drafted below — not the server's, which is tomorrow every US evening.
  const orgRaw = est.organizations as { timezone: string | null } | { timezone: string | null }[] | null;
  const today = calendarDate((Array.isArray(orgRaw) ? orgRaw[0] : orgRaw)?.timezone);
  if (est.expiry_date < today) {
    return new NextResponse("Estimate has expired", { status: 410 });
  }
  if (!["draft", "sent"].includes(est.status)) {
    return new NextResponse(`Estimate is already ${est.status}`, { status: 409 });
  }

  const { error } = await supabase
    .from("estimates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // On acceptance, auto-draft the invoice and notify the owner. Best-effort:
  // a failure here must not break the client's acceptance — the estimate is
  // already marked accepted and the owner can still convert manually from the
  // estimate page (the "Convert to invoice" button reappears when there's no
  // converted_invoice_id yet).
  if (status === "accepted") {
    try {
      const { invoiceId } = await convertEstimateToInvoice(
        supabase,
        est.organization_id,
        id,
        { today }
      );
      await createNotificationService(
        est.organization_id,
        {
          type: "system",
          title: `Quote ${est.estimate_number} accepted — invoice drafted`,
          body: "The client accepted online. A draft invoice is ready to review and send.",
          titleKey: "notifications.events.estimateAccepted",
          bodyKey: "notifications.events.estimateAcceptedBody",
          params: { number: est.estimate_number },
          link: `/books/invoices/${invoiceId}`,
        },
        supabase
      );
    } catch (e) {
      console.error("auto-convert on estimate acceptance failed", e);
    }
  }

  return NextResponse.json({ ok: true, status });
}

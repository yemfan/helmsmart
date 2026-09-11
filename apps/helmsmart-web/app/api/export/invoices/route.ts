/**
 * GET /api/export/invoices
 *
 * Returns a CSV of all invoices for the authenticated org.
 * Query params:
 *   ?status=paid|sent|draft|overdue|void (optional, filter by status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: (string | number | null | undefined)[]): string {
  return cols.map(csvEscape).join(",");
}

export async function GET(request: NextRequest) {
  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const statusFilter = searchParams.get("status");

  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(`
      invoice_number, status, issue_date, due_date,
      subtotal, tax_rate, tax_amount, total, paid_at,
      clients(first_name, last_name, company, email)
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: invoices, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    row("Invoice #", "Client", "Email", "Status", "Issue Date", "Due Date", "Subtotal", "Tax", "Total", "Paid At"),
  ];

  for (const inv of invoices ?? []) {
    const clientRaw = inv.clients;
    const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
      first_name: string | null; last_name: string | null;
      company: string | null; email: string | null;
    } | null;

    const clientName = client
      ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || ""
      : "";

    const effectiveStatus = inv.status === "sent" && inv.due_date < today ? "overdue" : inv.status;

    lines.push(row(
      inv.invoice_number,
      clientName,
      client?.email ?? "",
      effectiveStatus,
      inv.issue_date,
      inv.due_date,
      Number(inv.subtotal).toFixed(2),
      Number(inv.tax_amount).toFixed(2),
      Number(inv.total).toFixed(2),
      inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "",
    ));
  }

  const csv = lines.join("\r\n");
  const now  = new Date().toISOString().slice(0, 10);
  const filename = `invoices-${now}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

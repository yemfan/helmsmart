/**
 * GET /api/export/clients
 *
 * Returns a CSV of all clients for the authenticated org.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { orgToday } from "@/lib/org-timezone";

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

export async function GET() {
  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("first_name, last_name, company, email, phone, status, source, tags, lifetime_value, notes, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lines = [
    row("First Name", "Last Name", "Company", "Email", "Phone", "Status", "Source", "Tags", "Lifetime Value", "Notes", "Created"),
  ];

  for (const c of clients ?? []) {
    lines.push(row(
      c.first_name ?? "",
      c.last_name  ?? "",
      c.company    ?? "",
      c.email      ?? "",
      c.phone      ?? "",
      c.status,
      c.source     ?? "",
      Array.isArray(c.tags) ? (c.tags as string[]).join("; ") : "",
      c.lifetime_value != null ? Number(c.lifetime_value).toFixed(2) : "0.00",
      c.notes      ?? "",
      new Date(c.created_at).toLocaleDateString("en-US"),
    ));
  }

  const csv = lines.join("\r\n");
  const now  = await orgToday(orgId);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${now}.csv"`,
    },
  });
}

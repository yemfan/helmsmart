/**
 * GET /api/clients/search?q=<text>&limit=<n>
 *
 * Typeahead client search for the HelmSmart AI panel's per-client SMS tabs.
 * Org-scoped (helmsmart-org-id cookie + RLS). Returns a flat contact shape
 * the widget consumes: { id, name, email, phone }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "10"), 1), 25);
  if (q.length < 1) return NextResponse.json({ ok: true, contacts: [] });

  const orgId = await getMemberOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();
  // Strip PostgREST or() metacharacters from user input before interpolating.
  const safe = q.replace(/[,()%*]/g, " ").trim();
  if (!safe) return NextResponse.json({ ok: true, contacts: [] });
  const like = `%${safe}%`;

  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, company, email, phone")
    .eq("organization_id", orgId)
    .or(
      `first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const contacts = (data ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }));
  return NextResponse.json({ ok: true, contacts });
}

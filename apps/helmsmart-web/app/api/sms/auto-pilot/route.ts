/**
 * PATCH /api/sms/auto-pilot  { clientId, enabled }
 *
 * Toggles a client's auto_pilot flag (read by the inbound SMS webhook to
 * decide whether to auto-draft + send an AI reply). Org-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function PATCH(request: NextRequest) {
  let clientId = "";
  let enabled = false;
  try {
    const json = await request.json();
    clientId = String(json.clientId ?? "").trim();
    enabled = Boolean(json.enabled);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!clientId) return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });

  const orgId = await getMemberOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ auto_pilot: enabled })
    .eq("id", clientId)
    .eq("organization_id", orgId)
    // Load-bearing: an update RLS refuses matches zero rows and returns no
    // error, so without the rows back "not changed" would report as saved and
    // the panel would show Auto Pilot on while the webhook reads it as off.
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Not changed" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, autoPilot: enabled });
}

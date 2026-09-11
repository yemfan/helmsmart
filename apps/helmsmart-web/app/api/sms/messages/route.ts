/**
 * GET /api/sms/messages?clientId=<uuid>
 *
 * SMS thread for one client + the client's auto-pilot state, for the
 * HelmSmart AI panel. Org-scoped (helmsmart-org-id cookie + RLS).
 * twilio_status is populated by the status-callback webhook
 * (/api/twilio/sms/status); the widget hides the badge when it's absent.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });

  const orgId = await getMemberOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!client) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

  // auto_pilot may not exist yet (migration 00045) — read best-effort so the
  // thread still loads before the column is added.
  let autoPilot = false;
  {
    const { data: ap } = await supabase
      .from("clients")
      .select("auto_pilot")
      .eq("id", clientId)
      .maybeSingle();
    autoPilot = Boolean((ap as { auto_pilot?: boolean } | null)?.auto_pilot);
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, body, direction, sent_at, created_at, twilio_status, sent_by")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .eq("channel", "sms")
    .order("sent_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const messages = (data ?? []).map((m) => ({
    id: m.id,
    message: m.body,
    direction: m.direction,
    created_at: m.sent_at ?? m.created_at,
    twilio_status: m.twilio_status ?? null,
    // Who sent an outbound text (lib/message-provenance.ts) — the panel labels
    // Auto Pilot's and the other automatic sends under the bubble.
    sent_by: m.sent_by ?? null,
  }));

  return NextResponse.json({ ok: true, autoPilot, messages });
}

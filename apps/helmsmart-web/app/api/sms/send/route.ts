/**
 * POST /api/sms/send  { clientId, to, body }
 *
 * Sends an SMS for the HelmSmart AI panel — both its Send button and its Auto
 * Pilot, which posts here on its own once a draft is ready. Goes through the
 * consent guard in lib/outbound-send.ts, so a client who opted out of texts is
 * refused here with the reason, which the panel shows as-is. Returns the
 * { success } envelope the widget expects.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { sendSmsAsOrg, toSendMessageResult } from "@/lib/outbound-send";

const STATUS: Record<string, number> = {
  opted_out: 403,
  invalid_address: 400,
  no_organization: 401,
};

export async function POST(request: NextRequest) {
  const [t, tc, locale] = await Promise.all([getServerT("inbox"), getServerT("clients"), getServerLocale()]);

  let clientId: string | null = null;
  let to = "";
  let body = "";
  try {
    const json = await request.json();
    clientId = json.clientId ? String(json.clientId) : null;
    to = String(json.to ?? "").trim();
    body = String(json.body ?? "").trim();
  } catch {
    return NextResponse.json({ success: false, error: t("errors.invalidRequest") }, { status: 400 });
  }

  if (!to) return NextResponse.json({ success: false, error: t("errors.noPhone") }, { status: 400 });
  if (!body) return NextResponse.json({ success: false, error: t("errors.emptyMessage") }, { status: 400 });

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return NextResponse.json({ success: false, error: t("errors.noOrganization") }, { status: 401 });

  const supabase = await createClient();

  /*
   * Who is sending. With Auto Pilot on, the panel has no Send button — it
   * sends each draft by itself — so a send for an Auto Pilot client from this
   * route is Auto Pilot's, not a person's. Everything else here is a person
   * pressing Send on a draft they read.
   */
  let sentBy: "person" | "auto_pilot" = "person";
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("auto_pilot")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if ((client as { auto_pilot?: boolean } | null)?.auto_pilot) sentBy = "auto_pilot";
  }

  const outcome = await sendSmsAsOrg(supabase, orgId, {
    clientId,
    to,
    body,
    sentBy,
    purpose: sentBy === "auto_pilot" ? "automated" : "conversation",
  });
  const result = toSendMessageResult(outcome, "sms", { inbox: t, clients: tc, locale });
  if (result.ok) return NextResponse.json({ success: true });
  return NextResponse.json(
    { success: false, reason: result.reason, error: result.error },
    { status: STATUS[result.reason] ?? 502 },
  );
}

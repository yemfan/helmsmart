/**
 * POST /api/sms/send  { clientId, to, body }
 *
 * Sends an SMS for the HelmSmart AI panel's Send button. Goes through the
 * consent guard in lib/outbound-send.ts, so a client who opted out of texts is
 * refused here with the reason, which the panel shows as-is. Returns the
 * { success } envelope the widget expects.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { sendSmsAsOrg, toSendMessageResult } from "@/lib/outbound-send";
import { getMemberOrgId } from "@/lib/auth/org-context";

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

  const orgId = await getMemberOrgId();
  if (!orgId) return NextResponse.json({ success: false, error: t("errors.noOrganization") }, { status: 401 });

  const supabase = await createClient();

  /*
   * Always a person's send. The panel never sends by itself — a draft goes out
   * only when someone presses the Send button that names the recipient, Auto
   * Pilot or not. Auto Pilot's own replies come from the inbound webhook
   * (/api/twilio/sms), which labels them itself; labelling a Send here
   * "auto_pilot" would list the owner's own text as the AI's work.
   */
  const outcome = await sendSmsAsOrg(supabase, orgId, {
    clientId,
    to,
    body,
    sentBy: "person",
    purpose: "conversation",
  });
  const result = toSendMessageResult(outcome, "sms", { inbox: t, clients: tc, locale });
  if (result.ok) return NextResponse.json({ success: true });
  return NextResponse.json(
    { success: false, reason: result.reason, error: result.error },
    { status: STATUS[result.reason] ?? 502 },
  );
}

/**
 * Retell inbound-call webhook — POST /api/retell/inbound
 *
 * Fires when a call arrives, BEFORE the conversation starts. We map the dialed
 * number (to_number) to an org and hand back that org's receptionist brain as
 * Retell dynamic variables, so ONE shared Retell agent serves every tenant.
 *
 * Must be fast (Retell's timeout is ~10s) and return string→string values only.
 * Retell can't sign this webhook, so we gate with ?k=<RETELL_FUNCTION_SECRET>.
 * Set each Retell number's inbound_webhook_url to:
 *   https://<app>/api/retell/inbound?k=<RETELL_FUNCTION_SECRET>
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { loadReceptionistContext, buildReceptionistDynamicVariables, resolveInboundOrg } from "@/lib/receptionist-agent";
import { matchOrCreateClient } from "@/lib/booking";
import { normalizePhoneE164, formatPhoneForSpeech } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (secret && req.nextUrl.searchParams.get("k") !== secret) {
    return NextResponse.json({ call_inbound: { dynamic_variables: {} } }, { status: 401 });
  }

  let toNumber = "";
  let fromNumber = "";
  try {
    const body = await req.json();
    toNumber = String(body?.call_inbound?.to_number ?? "");
    fromNumber = String(body?.call_inbound?.from_number ?? "");
  } catch {
    /* malformed body — fall through to empty vars */
  }

  const db = await createServiceClient();
  let dynamic_variables: Record<string, string> = {};
  // resolveInboundOrg tolerates phone-format differences (+1 prefix, spacing) and
  // picks deterministically when more than one org claims the number.
  const org = await resolveInboundOrg(db, toNumber);
  // Honour the Settings toggle. It was read only by the legacy Twilio path, so
  // switching the receptionist off left the Retell rail answering with the org's
  // full brain — the one control the owner has, doing nothing. Serving no
  // variables leaves the agent with no prompt, which is the "off" the toggle
  // promises.
  if (org && !org.voiceAgentEnabled) {
    return NextResponse.json({ call_inbound: { dynamic_variables: {} } });
  }
  const orgId = org?.id ?? null;
  if (orgId) {
    const ctx = await loadReceptionistContext(db, orgId);

    // Give the receptionist the caller's own number so it can confirm it as the
    // callback number (and catch a mistyped/different number the caller dictates).
    const caller = normalizePhoneE164(fromNumber);
    if (caller.ok) ctx.callerNumber = formatPhoneForSpeech(caller.value);

    dynamic_variables = buildReceptionistDynamicVariables(ctx);

    // Capture the caller as a contact: match the caller ID to an existing client,
    // or create a lead if it's new — so every inbound caller becomes a follow-up-
    // able contact (and appears in outbound "Call all"). Runs in the background so
    // it never slows Retell's inbound response (which must return within ~10s).
    if (caller.ok) {
      after(() => matchOrCreateClient(orgId, caller.value));
    }
  }

  return NextResponse.json({ call_inbound: { dynamic_variables } });
}

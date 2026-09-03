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
 *
 * WHICH AGENT ANSWERS IS NOT OPTIONAL TO STATE.
 *
 * This route used to return dynamic variables and nothing else, leaving the
 * choice of agent entirely to whatever Retell had attached to the number. That
 * held only as long as the number carried the templated receptionist — and a
 * number that has been moved between products does not. Dialling
 * +1 626 888 8685 got "Lucy", who introduced herself as being from HelmSmart
 * and knew nothing about the business's own services: an agent whose prompt was
 * authored elsewhere, answering with none of this org's context, because the
 * variables we sent had no placeholders to land in.
 *
 * So the answer path now NAMES the agent via override_agent_id when
 * RETELL_AGENT_ID is set. The shared templated agent answers because we said
 * so, not because of how a number happens to be configured this week.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { loadReceptionistContext, buildReceptionistDynamicVariables, resolveInboundOrg } from "@/lib/receptionist-agent";
import { matchOrCreateClient } from "@/lib/booking";
import { normalizePhoneE164, formatPhoneForSpeech } from "@/lib/phone";

/**
 * An empty `call_inbound` is Retell's "we are not taking this call".
 *
 * IMPORTANT, and learned the hard way in CloseBoss: it only declines if the
 * number has NO default inbound agent in Retell. While a default agent is
 * attached, Retell answers with it and ignores us — which is how switching the
 * receptionist OFF still produced a live, unbranded bot that knew nothing. The
 * toggle looked like a control and was a suggestion.
 *
 * Every early return is logged with its reason, because three very different
 * situations used to produce the same silent `{}` — a bad secret, a number we
 * do not recognise, and a deliberately disabled receptionist — and from the
 * outside they were indistinguishable.
 */
function declineCall(reason: string, detail?: Record<string, unknown>) {
  console.warn(`[retell/inbound] not serving this call: ${reason}`, detail ?? {});
  return NextResponse.json({ call_inbound: { dynamic_variables: {} } });
}

export async function POST(req: NextRequest) {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (secret && req.nextUrl.searchParams.get("k") !== secret) {
    console.warn("[retell/inbound] rejected: ?k= did not match RETELL_FUNCTION_SECRET");
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
  // resolveInboundOrg tolerates phone-format differences (+1 prefix, spacing) and
  // picks deterministically when more than one org claims the number.
  const org = await resolveInboundOrg(db, toNumber);

  if (!org) {
    // Nobody owns this number. Say so: the number is live in Retell but no
    // organizations row claims it, which is a configuration gap someone has to
    // close, not something to absorb quietly.
    return declineCall("no organization claims the dialed number", { toNumber });
  }

  // Honour the Settings toggle. It was read only by the legacy Twilio path, so
  // switching the receptionist off left the Retell rail answering with the org's
  // full brain — the one control the owner has, doing nothing.
  if (!org.voiceAgentEnabled) {
    return declineCall("receptionist is switched off for this org", { orgId: org.id });
  }

  const ctx = await loadReceptionistContext(db, org.id);

  // Give the receptionist the caller's own number so it can confirm it as the
  // callback number (and catch a mistyped/different number the caller dictates).
  const caller = normalizePhoneE164(fromNumber);
  if (caller.ok) ctx.callerNumber = formatPhoneForSpeech(caller.value);

  const dynamic_variables = buildReceptionistDynamicVariables(ctx);

  // Capture the caller as a contact: match the caller ID to an existing client,
  // or create a lead if it's new — so every inbound caller becomes a follow-up-
  // able contact (and appears in outbound "Call all"). Runs in the background so
  // it never slows Retell's inbound response (which must return within ~10s).
  if (caller.ok) {
    after(() => matchOrCreateClient(org.id, caller.value));
  }

  // Name the agent when we know it. Omitting override_agent_id is what let a
  // stale agent on the number answer in our place; sending it makes the shared
  // templated receptionist authoritative. Guarded on a non-empty value so an
  // unset RETELL_AGENT_ID cannot send an empty override and break every call.
  const overrideAgentId = process.env.RETELL_AGENT_ID?.trim();
  if (!overrideAgentId) {
    console.warn(
      "[retell/inbound] RETELL_AGENT_ID is not set — whichever agent the number " +
        "carries will answer, and it may not be the templated receptionist.",
    );
    return NextResponse.json({ call_inbound: { dynamic_variables } });
  }

  return NextResponse.json({
    call_inbound: { override_agent_id: overrideAgentId, dynamic_variables },
  });
}

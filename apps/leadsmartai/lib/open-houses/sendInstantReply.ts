import "server-only";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { formatInstantReplySms, isEligibleForInstantReply } from "./instantReply";
import type { OpenHouseRow, OpenHouseVisitorRow } from "./types";

/**
 * Server-side orchestrator for the at-the-door instant SMS auto-reply.
 *
 * Called from the public sign-in route AFTER `recordPublicSignin` returns,
 * so the visitor row + (optional) contact row already exist. We:
 *   1. Re-fetch the visitor + open-house + agent (one round-trip each —
 *      can't trust the route to pass them all in safely).
 *   2. Run the eligibility gate (phone + consent + non-agented).
 *   3. Format the SMS via the pure formatter.
 *   4. Send via twilioSms.sendSMS, which logs to message_logs under the
 *      visitor's contact_id (when present — sendSMS no-ops the log if
 *      no leadId is supplied).
 *
 * Failure is best-effort: if Twilio is unconfigured, agents are missing
 * a name, or the send errors, we swallow and return a status. The
 * sign-in itself must NEVER fail because of an SMS hiccup.
 */

export type InstantReplyOutcome =
  | { status: "sent"; messageSid: string }
  | { status: "skipped"; reason: SkipReason }
  | { status: "failed"; error: string };

type SkipReason =
  | "twilio_not_configured"
  | "visitor_not_found"
  | "open_house_not_found"
  | "ineligible";

export async function sendOpenHouseInstantReply(
  visitorId: string,
): Promise<InstantReplyOutcome> {
  if (!isTwilioConfigured()) {
    return { status: "skipped", reason: "twilio_not_configured" };
  }

  // Pull the visitor row first.
  const { data: visitorData, error: visitorErr } = await supabaseAdmin
    .from("open_house_visitors")
    .select(
      "id, open_house_id, agent_id, contact_id, name, phone, marketing_consent, is_buyer_agented",
    )
    .eq("id", visitorId)
    .maybeSingle();
  if (visitorErr || !visitorData) {
    return { status: "skipped", reason: "visitor_not_found" };
  }
  const visitor = visitorData as Pick<
    OpenHouseVisitorRow,
    | "id"
    | "open_house_id"
    | "agent_id"
    | "contact_id"
    | "name"
    | "phone"
    | "marketing_consent"
    | "is_buyer_agented"
  >;

  if (
    !isEligibleForInstantReply({
      phone: visitor.phone,
      marketingConsent: visitor.marketing_consent,
      isBuyerAgented: visitor.is_buyer_agented,
    })
  ) {
    return { status: "skipped", reason: "ineligible" };
  }

  // Pull the property address for the SMS body.
  const { data: ohData, error: ohErr } = await supabaseAdmin
    .from("open_houses")
    .select("property_address")
    .eq("id", visitor.open_house_id)
    .maybeSingle();
  if (ohErr || !ohData) {
    return { status: "skipped", reason: "open_house_not_found" };
  }
  const oh = ohData as Pick<OpenHouseRow, "property_address">;

  // Best-effort agent name — we don't fail if missing, the formatter has
  // a "your agent" fallback.
  let agentFirstName: string | null = null;
  let agentBrokerage: string | null = null;
  try {
    const a = await loadAgentDisplayIdentity(visitor.agent_id);
    agentFirstName = a?.firstName ?? null;
    agentBrokerage = a?.brokerage ?? null;
  } catch {
    // Non-fatal.
  }

  const body = formatInstantReplySms({
    visitorName: visitor.name,
    propertyAddress: oh.property_address,
    agentFirstName,
    agentBrokerage,
  });

  const e164 = digitsToE164(visitor.phone ?? "");
  if (!e164) return { status: "skipped", reason: "ineligible" };

  try {
    const result = await sendSMS(e164, body, visitor.contact_id ?? undefined);
    return { status: "sent", messageSid: result.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("[open-houses.sendInstantReply] send failed:", msg);
    return { status: "failed", error: msg };
  }
}

function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER),
  );
}

function digitsToE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+1${d}` : null;
}

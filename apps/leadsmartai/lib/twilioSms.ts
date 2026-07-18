import twilio from "twilio";
import { supabaseServer } from "@/lib/supabaseServer";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

// Convert any phone input (E.164 "+1..." or raw digits) to the CRM's `(xxx) xxx-xxxx` format.
function normalizeToUsPhone(phone: string): string | null {
  const d = digitsOnly(phone).slice(-10);
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Normalize a US number to E.164 (+1XXXXXXXXXX). Twilio requires the leading
// "+"; a value saved as bare "16268887170" / "6268887170" / with formatting
// otherwise triggers a 20001 ("invalid parameter"). Non-US-looking input
// (short codes, already-valid other-country E.164) is left untouched.
function normalizeFromToE164(input: string): string {
  const d = digitsOnly(input);
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return input;
}

// Send an SMS via Twilio and log it in `message_logs`.
// `leadId` is optional; if omitted we attempt to find the most recent lead by phone.
export async function sendSMS(
  to: string,
  message: string,
  leadId?: string | number
): Promise<{ sid: string; leadId: string | null; messageLogId: string | null }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Your app historically used `TWILIO_FROM_NUMBER`; the spec uses `TWILIO_PHONE_NUMBER`.
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  // Prefer the A2P 10DLC Messaging Service when configured — it's the compliant
  // path and sends from a registered number in its pool, so messages don't fail
  // carrier error 30034 (a raw toll-free `from` typically can't send SMS).
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    const missing: string[] = [];
    if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
    if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
    if (!messagingServiceSid && !fromNumber)
      missing.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER/TWILIO_FROM_NUMBER");

    throw new Error(
      `Twilio SMS is not configured (missing: ${missing.join(", ")}).`
    );
  }

  const client = twilio(accountSid, authToken);

  const result = await client.messages.create({
    to,
    body: message,
    // Messaging Service (A2P-registered) when available; otherwise the raw
    // from-number, normalized defensively — a value saved without the leading
    // "+" historically broke the reply path.
    ...(messagingServiceSid
      ? { messagingServiceSid }
      : { from: normalizeFromToE164(fromNumber as string) }),
  });

  // Only log to message_logs when a lead_id is provided.
  // This avoids hard dependency on phone_number columns / migrations during testing.
  const resolvedLeadId: string | null = leadId ? String(leadId) : null;

  let messageLogId: string | null = null;
  if (resolvedLeadId) {
    try {
      const { data: logRow, error: logErr } = await supabaseServer
        .from("message_logs")
        .insert({
          contact_id: resolvedLeadId,
          type: "sms",
          status: "sent",
          content: message,
        } as any)
        .select("id")
        .single();

      if (logErr) {
        // SMS already sent; don't fail the send for logging issues.
        console.error("sendSMS: failed to write message_logs", logErr);
      } else {
        messageLogId = logRow?.id ? String(logRow.id) : null;
      }
    } catch (e) {
      console.error("sendSMS: message_logs insert threw", e);
    }
  }

  return { sid: String(result?.sid ?? ""), leadId: resolvedLeadId, messageLogId };
}


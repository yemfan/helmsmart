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

  if (!accountSid || !authToken || !fromNumber) {
    const missing: string[] = [];
    if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
    if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
    if (!fromNumber) missing.push("TWILIO_PHONE_NUMBER/TWILIO_FROM_NUMBER");

    throw new Error(
      `Twilio SMS is not configured (missing: ${missing.join(", ")}).`
    );
  }

  const client = twilio(accountSid, authToken);

  const result = await client.messages.create({
    to,
    from: fromNumber,
    body: message,
  });

  // Only log to message_logs when a lead_id is provided.
  // This avoids a hard dependency on the contacts table during testing.
  const resolvedLeadId: string | null = leadId ? String(leadId) : null;

  let messageLogId: string | null = null;
  if (resolvedLeadId) {
    try {
      const { data: logRow, error: logErr } = await supabaseServer
        .from("message_logs")
        .insert({
          lead_id: resolvedLeadId,
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


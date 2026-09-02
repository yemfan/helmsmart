/**
 * Twilio Voice Webhook — POST /api/twilio/voice
 *
 * Configure in Twilio console:
 *   Voice → Phone Number → "A call comes in" → Webhook → https://your-domain/api/twilio/voice
 *
 * Behaviour:
 *  - voice_agent_enabled → start AI conversation loop
 *  - voice_agent_disabled → play brief message + optional SMS auto-reply
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { twilioSender } from "@/lib/twilio-sender";
import { createNotificationService } from "@/lib/actions/notifications";
import { verifyTwilioSignature, formParams } from "@/lib/twilio-verify";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

async function handleRequest(request: NextRequest) {
  let from: string | null = null;
  let to: string | null = null;
  let callSid: string | null = null;

  try {
    if (request.method === "POST") {
      const formData = await request.formData();
      const params = formParams(formData);
      if (!verifyTwilioSignature(request, params)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
      from = params.From ?? null;
      to = params.To ?? null;
      callSid = params.CallSid ?? null;
    } else {
      // GET request — extract from URL params (for health checks)
      const url = new URL(request.url);
      from = url.searchParams.get("From");
      to = url.searchParams.get("To");
      callSid = url.searchParams.get("CallSid");
    }
  } catch {
    // If form parsing fails, return empty response
    return xml("<Response/>");
  }

  if (!from || !to) {
    return xml("<Response/>");
  }

  const supabase = await createServiceClient();

  // Find org by Twilio number
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, auto_reply, auto_reply_msg, voice_agent_enabled, voice_agent_greeting, voice_agent_prompt")
    .eq("twilio_number", to)
    .single();

  // Return quick response to Twilio immediately. This is the basic/fallback
  // webhook — the realtime AI agent answers on the Retell-owned number, not here.
  const twiml = new VoiceResponse();
  twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "Thanks for calling. We missed you but will be in touch shortly.");
  twiml.hangup();

  const response = xml(twiml.toString());

  // Handle async tasks in background
  if (org && callSid) {
    after(async () => {
      try {
        // Log the call
        const { data: client } = await supabase
          .from("clients")
          .select("id")
          .eq("organization_id", org.id)
          .eq("phone", from)
          .maybeSingle();

        await supabase.from("calls").insert({
          organization_id: org.id,
          client_id: client?.id ?? null,
          from_number: from,
          to_number: to,
          status: "missed",
          twilio_call_sid: callSid,
          auto_replied: false,
        });

        // Notify dashboard
        await createNotificationService(org.id, {
          type: "missed_call",
          title: "Missed call",
          body: `From ${from}`,
          link: "/reception",
        });

        // Passive SMS auto-reply. The realtime voice agent runs on the
        // Retell-owned number directly, so this fallback route only handles SMS.
        if (org.auto_reply && org.auto_reply_msg) {
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
          try {
            await twilioClient.messages.create({ ...(twilioSender(to) ?? { from: to }), to: from, body: org.auto_reply_msg });
            await supabase.from("messages").insert({
              organization_id: org.id,
              channel: "sms",
              direction: "outbound",
              from_address: to,
              to_address: from,
              body: org.auto_reply_msg,
              read: true,
              sent_at: new Date().toISOString(),
            });
            await supabase.from("calls").update({ auto_replied: true, reply_body: org.auto_reply_msg }).eq("twilio_call_sid", callSid);
          } catch (_) { /* SMS failed — call still logged */ }
        }
      } catch (err) {
        console.error("Twilio webhook background task error:", err);
      }
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

function xml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateSmsAssistantReply } from "@/lib/ai-sms/service";
import { inferIntentHeuristic } from "@/lib/ai-sms/intent";
import { logAssistantActivity } from "@/lib/realtyboss/activities";
import type { SmsReplyContext } from "@/lib/ai-sms/types";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

function formatUsPhoneFromDigits10(d: string) {
  const digits = d.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function emptyTwiml() {
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function twimlReply(message: string) {
  return new NextResponse(`<Response><Message>${escapeXml(message)}</Message></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export const runtime = "nodejs";

// Twilio webhook for inbound SMS replies.
// Configure this in Twilio Console:
// - Messaging -> Configure Webhook -> "A message comes in"
// - Endpoint: POST /api/webhooks/twilio-sms
//
// Two paths:
//   - Auto Pilot ON for the contact → AI generates a reply, returned
//     in the TwiML response so Twilio sends it directly. Inbound +
//     outbound persisted to sms_messages so the AI Guide thread shows
//     the conversation.
//   - Auto Pilot OFF → existing behavior: stop nurture automation,
//     mark logs replied, alert the agent.
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const from = String(formData.get("From") ?? "");
    const body = String(formData.get("Body") ?? "");

    const fromDigits = digitsOnly(from);
    const last10 = fromDigits.slice(-10);
    const formattedFrom = formatUsPhoneFromDigits10(last10);

    if (!formattedFrom) return emptyTwiml();

    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select(
        "id,agent_id,name,first_name,last_name,phone,property_address,city,state,rating,preferred_language,auto_pilot,notes_summary",
      )
      .eq("phone", formattedFrom)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!leadRow) return emptyTwiml();

    const leadId = String(leadRow.id);
    const agentId = leadRow.agent_id ? String(leadRow.agent_id) : null;
    const autoPilot = Boolean((leadRow as { auto_pilot?: boolean }).auto_pilot);

    // ── Auto Pilot path ───────────────────────────────────────────
    // Persist inbound first, then generate + return AI reply via
    // TwiML so Twilio delivers it without a second API hop. Skip the
    // automation-stop / agent-alert side effects in this branch —
    // Auto Pilot is the agent saying "the AI handles this contact."
    if (autoPilot) {
      try {
        await supabaseAdmin.from("sms_messages").insert({
          contact_id: leadId,
          agent_id: agentId,
          message: body,
          direction: "inbound",
        } as Record<string, unknown>);
      } catch (e) {
        console.warn("[twilio-sms autopilot] inbound persist", e);
      }

      const { data: recent } = await supabaseAdmin
        .from("sms_messages")
        .select("direction,message,created_at")
        .eq("contact_id", leadId)
        .order("created_at", { ascending: false })
        .limit(10);

      const recentMessages = ((recent ?? []) as Array<{ direction: string; message: string; created_at: string }>)
        .reverse()
        .map((m) => ({
          direction: (m.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
          body: m.message,
          createdAt: m.created_at,
        }));

      const toPhone = String(formData.get("To") ?? "");
      const ctx: SmsReplyContext = {
        fromPhone: from,
        toPhone,
        inboundBody: body,
        lead: {
          leadId,
          name: leadRow.name ?? null,
          phone: leadRow.phone ?? null,
          status: null,
          leadScore: null,
          leadTemperature: leadRow.rating ?? null,
          propertyAddress: leadRow.property_address ?? null,
          city: leadRow.city ?? null,
          state: leadRow.state ?? null,
          intent: null,
          assignedAgentId: agentId,
          preferredLanguage: leadRow.preferred_language ?? null,
        },
        recentMessages,
        inferredIntent: inferIntentHeuristic(body),
      };

      let replyText: string;
      try {
        const reply = await generateSmsAssistantReply(ctx);
        replyText = reply.replyText.trim();
      } catch (e) {
        console.warn("[twilio-sms autopilot] generateSmsAssistantReply", e);
        replyText = "Got it — let me check on that and circle back shortly.";
      }

      try {
        await supabaseAdmin.from("sms_messages").insert({
          contact_id: leadId,
          agent_id: agentId,
          message: replyText,
          direction: "outbound",
          twilio_status: "twiml",
        } as Record<string, unknown>);
      } catch (e) {
        console.warn("[twilio-sms autopilot] outbound persist", e);
      }

      // RealtyBoss activity feed (fire-and-forget — never fails the webhook).
      if (agentId) {
        void logAssistantActivity({
          agentId,
          assistantType: "sales_assistant",
          activityType: "sms_auto_reply",
          summary: `Replied to ${leadRow.name?.trim() || from} via SMS (Auto Pilot)`,
          outcome: "Reply sent",
          relatedEntityType: "contact",
          relatedEntityId: String(leadId),
        });
      }

      try {
        await supabaseServer
          .from("contacts")
          .update({
            sms_last_inbound_at: new Date().toISOString(),
            sms_last_outbound_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq("id", leadId);
      } catch {
        // optional columns
      }

      return twimlReply(replyText);
    }

    // ── Existing (non-Auto-Pilot) path ────────────────────────────
    // Avoid duplicate reply scoring/alerts within 24h.
    const { data: existingReplied } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("contact_id", leadId)
      .eq("status", "replied")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (!existingReplied?.id) {
      // Persist inbound to sms_messages too so the AI Guide thread is
      // accurate even when Auto Pilot is off.
      try {
        await supabaseAdmin.from("sms_messages").insert({
          contact_id: leadId,
          agent_id: agentId,
          message: body,
          direction: "inbound",
        } as Record<string, unknown>);
      } catch (e) {
        console.warn("[twilio-sms] inbound persist", e);
      }

      // Record reply event + mark latest sms log as replied (best-effort).
      await supabaseServer.rpc("log_lead_event", {
        p_contact_id: leadId,
        p_event_type: "reply",
        p_metadata: { body },
      });

      const { data: latestSmsLog } = await supabaseServer
        .from("message_logs")
        .select("id")
        .eq("contact_id", leadId)
        .eq("type", "sms")
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSmsLog?.id) {
        await supabaseServer.from("message_logs").update({ status: "replied" }).eq("id", latestSmsLog.id);
      } else {
        await supabaseServer.from("message_logs").insert({
          contact_id: leadId,
          type: "sms",
          status: "replied",
        } as Record<string, unknown>);
      }

      const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
        p_contact_id: leadId,
        p_delta: 10,
      } as Record<string, unknown>);

      const rating = (scoreRes as { data?: { rating?: string } } | null)?.data?.rating;

      // Stop automation for this lead.
      await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("lead_id", leadId);
      await supabaseServer.from("contacts").update({ automation_disabled: true } as Record<string, unknown>).eq("id", leadId);

      // Alerts
      if (agentId) {
        await supabaseServer.from("nurture_alerts").insert({
          agent_id: agentId,
          contact_id: leadId,
          type: "replied",
          message: "Lead replied via SMS — nurture sequence stopped.",
        } as Record<string, unknown>);

        if (rating === "hot") {
          await supabaseServer.from("nurture_alerts").insert({
            agent_id: agentId,
            contact_id: leadId,
            type: "hot",
            message: "Lead temperature turned HOT (reply).",
          } as Record<string, unknown>);
        }
      }
    }

    return emptyTwiml();
  } catch {
    // Always acknowledge to avoid Twilio retries.
    return emptyTwiml();
  }
}

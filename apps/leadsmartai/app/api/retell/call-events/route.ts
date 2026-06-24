import { NextRequest, NextResponse, after } from "next/server";
import {
  finalizeCallByProviderId,
  findContactByPhone,
  logInboundCallStart,
  notifyPersonalCall,
} from "@/lib/missed-call/service";
import { resolveCallBacksForPhone } from "@/lib/missed-call/callbacks";
import { resolveAgentIdByReceptionistNumber } from "@/lib/voice-receptionist/settings";
import {
  captureLeadFromInboundCall,
  classifyCallInterest,
  markContactNotInterested,
} from "@/lib/voice-agent/lead-capture";
import { logAssistantActivity } from "@/lib/realtorboss/activities";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Retell call-events webhook (LeadSmart) — POST /api/retell/call-events
 *
 * Retell POSTs call lifecycle events (call_started / call_ended / call_analyzed)
 * to the agent's webhook_url. We use the terminal events to finalize the
 * `call_logs` row a placed outbound call wrote at dial time (matched by the
 * Retell call_id, stored in twilio_call_sid): set the real status + duration,
 * and attach the AI call summary once analysis is ready.
 *
 * No-ops for any call_id we didn't log (e.g. inbound Retell calls), so it's safe
 * to point the whole agent here. Always returns 200 so Retell doesn't retry-storm.
 * Retell can't sign this, so gate with ?k=<RETELL_FUNCTION_SECRET>, same as
 * /api/retell/inbound.
 */

type RetellCall = {
  call_id?: string;
  call_type?: string;
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  call_status?: string;
  disconnection_reason?: string;
  duration_ms?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  transcript?: string;
  call_analysis?: { call_summary?: string | null } | null;
};

/** Map Retell's disconnection reason → the call_logs status the badge renders. */
function mapStatus(callStatus: string | undefined, reason: string | undefined): string {
  const r = (reason || "").toLowerCase();
  if (r.includes("no_answer")) return "no_answer";
  if (r.includes("busy")) return "busy";
  if (r.includes("voicemail") || r.includes("machine")) return "voicemail";
  if (r.includes("failed") || r.startsWith("error") || callStatus === "error") return "failed";
  // user_hangup, agent_hangup, call_transfer, inactivity, max_duration, etc.
  return "completed";
}

function durationSeconds(call: RetellCall): number | null {
  if (typeof call.start_timestamp === "number" && typeof call.end_timestamp === "number") {
    return (call.end_timestamp - call.start_timestamp) / 1000;
  }
  if (typeof call.duration_ms === "number") return call.duration_ms / 1000;
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (secret && req.nextUrl.searchParams.get("k") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      event?: string;
      call?: RetellCall;
    };
    const call = body.call;
    if (!call?.call_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // call_started: log inbound Lucy calls so they appear in the activity feed.
    // (Outbound rows are already written at placement, so we skip those here —
    // call_started for them would otherwise create a second row.) The call-events
    // finalizer below then advances inbound rows the same way as outbound.
    if (body.event === "call_started") {
      if (call.direction === "inbound" && call.from_number && call.to_number) {
        const agentId = await resolveAgentIdByReceptionistNumber(call.to_number);
        if (agentId) {
          await logInboundCallStart({
            agentId,
            fromPhone: call.from_number,
            toPhone: call.to_number,
            providerCallId: call.call_id,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Only the terminal events carry an outcome — ignore anything else.
    if (body.event !== "call_ended" && body.event !== "call_analyzed") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const summary = call.call_analysis?.call_summary?.trim() || "";
    const status = mapStatus(call.call_status, call.disconnection_reason);
    await finalizeCallByProviderId({
      providerCallId: call.call_id,
      status,
      durationSeconds: durationSeconds(call),
      // Only overwrite the placement note once we have a summary (call_analyzed).
      note: summary ? `AI call summary: ${summary}` : null,
    });

    // A CONNECTED call with the caller — in either direction — resolves
    // any pending missed-call call-back ladder for them: they answered
    // a call-back, or they called again and the receptionist answered.
    if (body.event === "call_ended" && status === "completed") {
      const callId = call.call_id;
      const direction = call.direction;
      const fromNumber = call.from_number ?? null;
      const toNumber = call.to_number ?? null;
      after(async () => {
        try {
          if (direction === "inbound" && fromNumber && toNumber) {
            const agentId = await resolveAgentIdByReceptionistNumber(toNumber);
            if (agentId) await resolveCallBacksForPhone({ agentId, phone: fromNumber });
          } else if (direction === "outbound" && toNumber) {
            const { data } = await supabaseAdmin
              .from("call_logs")
              .select("agent_id")
              .eq("twilio_call_sid", callId)
              .maybeSingle();
            const agentId = (data as { agent_id: unknown } | null)?.agent_id;
            if (agentId) {
              await resolveCallBacksForPhone({ agentId: String(agentId), phone: toNumber });
            }
          }
        } catch (e) {
          console.error("retell/call-events: callback resolve failed", e);
        }
      });
    }

    // RealtorBoss activity feed — outbound AI calls belong to the Sales
    // Assistant. Logged once, on call_ended (call_analyzed would double
    // up). Runs after the response; a failure can't affect the webhook.
    if (body.event === "call_ended" && call.direction === "outbound") {
      const callId = call.call_id;
      const toNumber = call.to_number ?? null;
      after(async () => {
        try {
          const { data } = await supabaseAdmin
            .from("call_logs")
            .select("agent_id, contact_id")
            .eq("twilio_call_sid", callId)
            .maybeSingle();
          const row = data as { agent_id: unknown; contact_id: string | null } | null;
          if (!row?.agent_id) return;
          await logAssistantActivity({
            agentId: String(row.agent_id),
            assistantType: "sales_assistant",
            activityType: "outbound_ai_call",
            summary: `Placed an AI call${toNumber ? ` to ${toNumber}` : ""}`,
            outcome: status === "completed" ? "Connected" : status.replace(/_/g, " "),
            requiresAttention: false,
            relatedEntityType: row.contact_id ? "contact" : null,
            relatedEntityId: row.contact_id,
          });
        } catch (e) {
          console.error("retell/call-events: outbound activity log failed", e);
        }
      });
    }

    // On analysis of an INBOUND call, capture the caller as a CRM contact + a
    // follow-up task (extracted from Lucy's summary). Runs after the response so
    // the webhook stays fast; no-ops without an owning agent or a summary.
    if (
      body.event === "call_analyzed" &&
      call.direction === "inbound" &&
      summary &&
      call.from_number &&
      call.to_number
    ) {
      const fromPhone = call.from_number;
      const toNumber = call.to_number;
      const providerCallId = call.call_id;
      const transcript = call.transcript;
      after(async () => {
        try {
          const agentId = await resolveAgentIdByReceptionistNumber(toNumber);
          if (agentId) {
            // Personal (sphere) callers don't become leads — the right
            // follow-up is the Realtor calling back personally, so we
            // skip capture and drop a reminder in their inbox instead.
            const known = await findContactByPhone(agentId, fromPhone).catch(() => null);
            if (known?.personal) {
              await notifyPersonalCall({
                agentId,
                contact: known,
                callerPhone: fromPhone,
                kind: "answered",
              });
            } else {
              await captureLeadFromInboundCall({ agentId, fromPhone, summary, transcript, providerCallId });
            }
            // RealtorBoss activity feed — the Receptionist answered and
            // summarized this inbound call. Logged here (call_analyzed)
            // so the activity carries the AI summary.
            await logAssistantActivity({
              agentId,
              assistantType: "receptionist",
              activityType: "inbound_call_answered",
              summary: `Answered a call from ${known?.name?.trim() || fromPhone}`,
              outcome: summary.length > 180 ? `${summary.slice(0, 177)}…` : summary,
            });
          }
        } catch (e) {
          console.error("retell/call-events: lead capture failed", e);
        }
      });
    }

    // On analysis of an answered OUTBOUND AI call (e.g. a follow-up call-back):
    // if the caller showed no interest, close them out — archive + mark
    // not-interested — so we stop following up and the leads-only gate won't
    // re-start a call-back ladder if they're dialed again. (The ladder itself
    // already stopped when the call connected; this prevents re-engagement.)
    if (body.event === "call_analyzed" && call.direction === "outbound" && summary && call.to_number) {
      const callId = call.call_id;
      const toNumber = call.to_number;
      const transcript = call.transcript;
      after(async () => {
        try {
          const { data } = await supabaseAdmin
            .from("call_logs")
            .select("agent_id, contact_id")
            .eq("twilio_call_sid", callId)
            .maybeSingle();
          const row = data as { agent_id: unknown; contact_id: string | null } | null;
          if (!row?.agent_id) return;
          const agentId = String(row.agent_id);

          const interest = await classifyCallInterest(summary, transcript);
          if (interest !== "not_interested") return; // only close on a clear decline

          let contactId = row.contact_id;
          if (!contactId) {
            const c = await findContactByPhone(agentId, toNumber).catch(() => null);
            contactId = c?.id ?? null;
          }
          if (!contactId) return;

          await markContactNotInterested(contactId);
          await logAssistantActivity({
            agentId,
            assistantType: "sales_assistant",
            activityType: "lead_closed_not_interested",
            summary: `Closed out — caller wasn't interested${toNumber ? ` (${toNumber})` : ""}`,
            outcome: summary.length > 180 ? `${summary.slice(0, 177)}…` : summary,
            requiresAttention: false,
            relatedEntityType: "contact",
            relatedEntityId: contactId,
          });
        } catch (e) {
          console.error("retell/call-events: disposition close failed", e);
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("retell/call-events", e);
    // Always 200 — a webhook error must not make Retell retry-storm.
    return NextResponse.json({ ok: true });
  }
}

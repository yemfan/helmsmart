import { NextResponse } from "next/server";
import { notifyAgentOfHotLead } from "@/lib/ai-sms/notifications";
import {
  applyEmailExtractedLeadFields,
  createEmailLeadIfMissing,
  findLeadByEmail,
  getRecentEmailMessages,
  logEmailMessage,
} from "@/lib/ai-email/lead-resolution";
import { inferEmailIntentHeuristic } from "@/lib/ai-email/intent";
import { generateEmailAssistantReply } from "@/lib/ai-email/service";
import { sendOutboundEmail } from "@/lib/ai-email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { autoDetectContactLanguage } from "@/lib/locales/autoDetectContactLanguage";
import {
  dispatchMobileInboundEmailPush,
  dispatchMobileNeedsHumanPush,
} from "@/lib/mobile/pushNotificationsService";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

export const runtime = "nodejs";

function authorizeInbound(req: Request) {
  const secret = process.env.AI_EMAIL_INBOUND_SECRET?.trim();
  const h = req.headers.get("authorization") || "";
  if (process.env.NODE_ENV === "production" && !secret) return false;
  if (secret) return h === `Bearer ${secret}`;
  return true;
}

export async function POST(req: Request) {
  if (!authorizeInbound(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      fromEmail?: string;
      toEmail?: string;
      subject?: string;
      body?: string;
      fromName?: string | null;
      skipDeliver?: boolean;
    };
    const fromEmail = String(body.fromEmail ?? "").trim();
    const toEmail = String(body.toEmail ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!fromEmail || !toEmail || !subject || !text) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    let lead = await findLeadByEmail(fromEmail);
    if (!lead?.leadId) {
      if (process.env.EMAIL_AI_CREATE_LEAD_FOR_UNKNOWN === "false") {
        return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
      }
      lead = await createEmailLeadIfMissing({
        email: fromEmail,
        name: body.fromName ?? null,
        source: "email_inbound",
        intent: inferEmailIntentHeuristic(subject, text),
      });
    }

    const leadId = String(lead.leadId);

    await logEmailMessage({
      leadId,
      direction: "inbound",
      subject,
      body: text,
    });

    // Inbound email = the lead is engaged. Bump last_activity_at and
    // close any open "Follow up with inactive lead" tasks for them
    // — the agent should respond to the new email, not reach out
    // cold. Best-effort, scoped by assigned agent.
    if (lead.assignedAgentId) {
      try {
        const { markContactActivity } = await import("@/lib/contacts/activity");
        await markContactActivity(lead.assignedAgentId, leadId, { contactName: lead.name });
      } catch {
        // best-effort housekeeping
      }
    }

    // Auto-detect language on first CJK-containing email. Same semantics
    // as the SMS webhook — NULL-only write, never overwrites an explicit
    // preference, never blocks the pipeline on failure.
    void autoDetectContactLanguage({
      supabase: supabaseAdmin as never,
      contactId: leadId,
      // Subject often carries the strongest signal (short, punchy, no
      // quoted English chrome from mail clients), but body is still
      // a better sample on average — include both.
      inboundText: `${subject}\n${text}`,
    }).then((r) => {
      if (r.kind === "error") {
        console.error("[ai-email/process-inbound] autoDetectContactLanguage:", r.error);
      }
    }).catch((e) => {
      console.error("[ai-email/process-inbound] autoDetectContactLanguage (unexpected):", e);
    });

    if (lead.assignedAgentId) {
      void dispatchMobileInboundEmailPush({
        agentId: lead.assignedAgentId,
        leadId,
        leadName: lead.name ?? null,
        subject,
        preview: text,
      }).catch(() => {});
    }

    const recentMessages = await getRecentEmailMessages(leadId, 8);
    const inferredIntent = inferEmailIntentHeuristic(subject, text);

    const reply = await generateEmailAssistantReply({
      fromEmail,
      toEmail,
      subject,
      inboundBody: text,
      lead,
      recentMessages,
      inferredIntent,
    });

    try {
      if (reply.extractedData) {
        await applyEmailExtractedLeadFields(leadId, reply.extractedData, reply.inferredIntent);
      }
    } catch {
      // ignore
    }

    const agentId = lead.assignedAgentId;
    const aiRequestsHuman = Boolean(reply.needsHuman) || reply.tags.includes("human_escalation");
    if (aiRequestsHuman && agentId) {
      void dispatchMobileNeedsHumanPush({
        agentId,
        leadId,
        leadName: lead.name ?? null,
        channel: "email",
        reason: `Email · ${reply.inferredIntent}`,
      }).catch(() => {});
    }

    const wantsAgent =
      reply.hotLead ||
      reply.needsHuman ||
      reply.nextBestAction === "notify_agent" ||
      reply.tags.includes("human_escalation");

    if (wantsAgent && agentId) {
      try {
        await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "hot", message: `AI email escalation (${reply.inferredIntent}): ${subject.slice(0, 80)}` }, supabaseAdmin);
      } catch {
        // ignore
      }
    }

    if (process.env.EMAIL_HOT_LEAD_AGENT_TEXT !== "false" && wantsAgent && agentId) {
      try {
        await notifyAgentOfHotLead({
          leadId,
          reason: reply.needsHuman
            ? "Human escalation (email)"
            : `Hot email intent: ${reply.inferredIntent}`,
          latestMessage: text.slice(0, 500),
        });
      } catch {
        // ignore
      }
    }

    const deliver = body.skipDeliver !== true && process.env.EMAIL_AI_DRAFT_ONLY !== "true";
    await sendOutboundEmail({
      leadId,
      to: fromEmail,
      subject: reply.subject,
      body: reply.replyBody,
      actorType: "ai",
      actorName: "LeadSmart AI",
      deliver,
    });

    try {
      await supabaseAdmin.rpc("log_lead_event", {
        p_contact_id: leadId,
        p_event_type: "ai_email_reply",
        p_metadata: {
          inferredIntent: reply.inferredIntent,
          nextBestAction: reply.nextBestAction,
          hotLead: reply.hotLead,
          needsHuman: reply.needsHuman,
          tags: reply.tags,
          delivered: deliver,
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, leadId, reply });
  } catch (error) {
    console.error("process inbound email error:", error);
    return NextResponse.json({ success: false, error: "Failed to process inbound email" }, { status: 500 });
  }
}

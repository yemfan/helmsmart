import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendSMS } from "@/lib/twilioSms";
import { logSmsMessage } from "@/lib/smsAutoFollow";
import { validateTwilioSignature } from "@/lib/ai-sms/twilio";
import {
  applySmsExtractedLeadFields,
  createSmsLeadIfMissing,
  getRecentSmsMessages,
  leadRowToSnapshot,
} from "@/lib/ai-sms/lead-resolution";
import { inferIntentHeuristic } from "@/lib/ai-sms/intent";
import { generateSmsAssistantReply } from "@/lib/ai-sms/service";
import { needsHumanEscalation } from "@/lib/ai-sms/safety";
import { isHotLeadFromSms } from "@/lib/ai-sms/hot-lead";
import { notifyAgentOfHotLead } from "@/lib/ai-sms/notifications";
import {
  dispatchMobileInboundSmsPush,
  dispatchMobileNeedsHumanPush,
} from "@/lib/mobile/pushNotificationsService";
import { autoDetectContactLanguage } from "@/lib/locales/autoDetectContactLanguage";
import type { SmsAssistantReply } from "@/lib/ai-sms/types";
import { agentBrandName } from "@/lib/branding/agentBrand";
import { shouldAiReply, type ConversationMessage } from "@/lib/ai-sms/replyGate";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

function normalizeTwilioFromToUsPhone(from: string): string | null {
  const d = digitsOnly(from).slice(-10);
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function normalizeUsPhoneToE164(phone: string): string | null {
  const digits = digitsOnly(phone);
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return null;
  return `+1${last10}`;
}

function isUnsubscribeMessage(msg: string) {
  const s = msg.toLowerCase();
  return (
    /\bstop\b/.test(s) ||
    s.includes("unsubscribe") ||
    s.includes("opt out") ||
    s.includes("opt-out") ||
    s.includes("cancel")
  );
}

function isHighIntentMessage(msg: string) {
  const s = msg.toLowerCase();
  return (
    s.includes("call") ||
    s.includes("schedule") ||
    s.includes("appointment") ||
    s.includes("book") ||
    s.includes("cma") ||
    s.includes("mortgage") ||
    s.includes("rate") ||
    s.includes("offer") ||
    s.includes("pricing") ||
    s.includes("estimate") ||
    s.includes("pricing") ||
    s.includes("book a") ||
    s.includes("talk") ||
    s.includes("schedule a")
  );
}

function getSmsAiCooldownMinutes() {
  const raw = Number(process.env.SMS_AI_COOLDOWN_MINUTES ?? "10");
  if (!Number.isFinite(raw)) return 10;
  // Guardrails: minimum 1 minute, maximum 24 hours.
  return Math.min(24 * 60, Math.max(1, Math.floor(raw)));
}

function withOptOutFooter(message: string) {
  const m = String(message ?? "").trim();
  if (/reply\s+stop\s+to\s+unsubscribe/i.test(m)) return m;
  return `${m} Reply STOP to unsubscribe.`;
}

function twilioWebhookPublicUrl(req: Request) {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) return "";
  const path = new URL(req.url).pathname;
  return `${base}${path}`;
}

const leadSmsSelect =
  "id,agent_id,sms_opt_in,contact_method,rating,property_address,name,lead_status,phone,email,nurture_score,intent,city,state,sms_ai_enabled,sms_agent_takeover";

export const runtime = "nodejs";

// Twilio webhook: incoming SMS for lead nurturing.
// Configure Twilio Messaging -> "A message comes in":
// POST https://<your-domain>/api/sms/webhook
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const formParams = Object.fromEntries(
      Array.from(formData.entries()).map(([k, v]) => [k, String(v)])
    );

    const signature = req.headers.get("x-twilio-signature") || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const publicWebhookUrl = twilioWebhookPublicUrl(req);

    if (
      process.env.NODE_ENV === "production" &&
      process.env.TWILIO_VALIDATE_WEBHOOK !== "false" &&
      authToken &&
      publicWebhookUrl
    ) {
      const ok = validateTwilioSignature({
        authToken,
        signature,
        url: publicWebhookUrl,
        formParams,
      });
      if (!ok) {
        return new NextResponse("Invalid signature", { status: 403 });
      }
    }

    const fromRaw = String(formParams.From ?? "");
    const toRaw = String(formParams.To ?? "");
    const body = String(formParams.Body ?? "").trim();

    const fromUsPhone = normalizeTwilioFromToUsPhone(fromRaw);
    if (!fromUsPhone || !body) {
      return new NextResponse("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const fromDigits = digitsOnly(fromUsPhone);

    // Best-effort match:
    // 1) prefer an exact phone match with sms_opt_in if the column exists
    // 2) fallback to phone + contact_method if those columns don't exist
    let leadRow: any = null;
    try {
      const { data: leadByPhoneNumber, error: leadErr1 } = await supabaseServer
        .from("contacts")
        .select(leadSmsSelect)
        .eq("phone", fromUsPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leadErr1) throw leadErr1;
      leadRow = leadByPhoneNumber ?? null;
    } catch {
      // ignore; fallback below
    }

    if (!leadRow) {
      const { data: leadByPhone, error: leadErr2 } = await supabaseServer
        .from("contacts")
        .select(leadSmsSelect)
        .eq("phone", fromUsPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leadErr2) throw leadErr2;

      leadRow = leadByPhone ?? null;

      // Additional fallback: match by digits-only if stored phone format differs.
      if (!leadRow) {
        const { data: leadByDigits, error: leadErr3 } = await supabaseServer
          .from("contacts")
          .select(leadSmsSelect)
          .ilike("phone", `%${fromDigits}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (leadErr3) throw leadErr3;
        leadRow = leadByDigits ?? null;
      }
    }

    if (!leadRow && process.env.SMS_AI_CREATE_LEAD_FOR_UNKNOWN_INBOUND === "true") {
      try {
        await createSmsLeadIfMissing({
          phoneDisplay: fromUsPhone,
          source: "sms_inbound",
          intent: inferIntentHeuristic(body),
        });
        const { data: createdLead, error: createdErr } = await supabaseServer
          .from("contacts")
          .select(leadSmsSelect)
          .eq("phone", fromUsPhone)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!createdErr) {
          leadRow = createdLead ?? null;
        }
      } catch {
        // ignore
      }
    }

    if (!leadRow) {
      return new NextResponse("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const leadId = String(leadRow.id);
    const agentId = leadRow.agent_id ? String(leadRow.agent_id) : null;
    let lastAssistant: SmsAssistantReply | null = null;
    let smsOptIn =
      typeof leadRow.sms_opt_in !== "undefined" ? Boolean(leadRow.sms_opt_in) : leadRow.contact_method
        ? String(leadRow.contact_method).toLowerCase() === "sms" ||
          String(leadRow.contact_method).toLowerCase() === "both"
        : false;
    const leadRating = String((leadRow as any).rating ?? "new").toLowerCase();
    const stage: "new" | "warm" | "hot" =
      leadRating === "hot" ? "hot" : leadRating === "warm" ? "warm" : "new";
    const propertyAddress = String((leadRow as any).property_address ?? "");

    // Always save inbound message.
    try {
      await supabaseServer.from("message_logs").insert({
        contact_id: leadId,
        type: "sms",
        status: "received",
        content: body,
      } as any);
    } catch {}
    try {
      await logSmsMessage({
        leadId,
        agentId,
        message: body,
        direction: "inbound",
      });
    } catch {}
    try {
      await supabaseServer
        .from("contacts")
        .update({ sms_last_inbound_at: new Date().toISOString() } as any)
        .eq("id", leadId);
    } catch {}

    // Inbound SMS = the lead is engaged. Bump last_activity_at and
    // close any open "Follow up with inactive lead" tasks for them
    // — the agent should respond, not reach out cold. Best-effort,
    // scoped by assigned agent.
    if (agentId) {
      try {
        const { markContactActivity } = await import("@/lib/contacts/activity");
        await markContactActivity(agentId, leadId, {
          contactName: (leadRow as { name?: string | null }).name ?? null,
        });
      } catch {
        // best-effort housekeeping
      }
      // An inbound reply is an engagement signal — refresh the composite rating.
      try {
        const { recomputeLeadRating } = await import("@/lib/contacts/recomputeLeadRating");
        await recomputeLeadRating(leadId);
      } catch {
        // best-effort
      }
    }

    // Auto-detect inbound language on first CJK message. No-ops when
    // `preferred_language` is already set (explicit choice wins) or when
    // the inbound text is English (keeps NULL so "no override" stays
    // visible on the Contacts page). Failures never block the pipeline.
    void autoDetectContactLanguage({
      supabase: supabaseServer as never,
      contactId: leadId,
      inboundText: body,
    }).then((r) => {
      if (r.kind === "error") {
        console.error("[sms/webhook] autoDetectContactLanguage:", r.error);
      }
    }).catch((e) => {
      console.error("[sms/webhook] autoDetectContactLanguage (unexpected):", e);
    });

    const unsubscribe = isUnsubscribeMessage(body);
    const highIntent = isHighIntentMessage(body);

    // A contact who texts us first has initiated the conversation — that's
    // implied consent to reply. Auto opt them in (unless they're opting OUT)
    // so the AI responder isn't silently blocked by a false sms_opt_in that was
    // never updated. Flip the local flag too so the reply fires on THIS message,
    // not just the next one. The STOP/unsubscribe branch below still wins.
    if (!unsubscribe && !smsOptIn) {
      smsOptIn = true;
      try {
        await supabaseServer
          .from("contacts")
          // Record where the consent came from, not just that it exists. The
          // web-form path already stamps these; this one set the flag and left
          // no trace of why, which is the half that matters if it is ever
          // questioned.
          .update({
            sms_opt_in: true,
            tcpa_consent_at: new Date().toISOString(),
            tcpa_consent_source: "inbound_sms",
          } as any)
          .eq("id", leadId);
      } catch {}
    }

    if (agentId && !unsubscribe) {
      void dispatchMobileInboundSmsPush({
        agentId,
        leadId,
        leadName: (leadRow as { name?: string | null }).name ?? null,
        preview: body,
      }).catch(() => {});
    }

    // Dedupe: if we already processed a reply recently, don't double-score/alerts.
    const { data: existingReplied } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("contact_id", leadId)
      .eq("type", "sms")
      .eq("status", "replied")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    const alreadyProcessedReply = Boolean(existingReplied?.id);

    // Mark latest outbound SMS (sent) as replied.
    const { data: latestSentSms } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("contact_id", leadId)
      .eq("type", "sms")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSentSms?.id) {
      await supabaseServer
        .from("message_logs")
        .update({ status: "replied" })
        .eq("id", latestSentSms.id);
    }

    // Unsubscribe handling (safety)
    if (unsubscribe) {
      try {
        await supabaseServer
          .from("contacts")
          .update({
            sms_opt_in: false,
            automation_disabled: true,
            contact_method: "email",
            sms_opted_out_at: new Date().toISOString(),
          } as any)
          .eq("id", leadId);
      } catch {}
      // Best-effort: also complete any active lead sequence.
      try {
        await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("lead_id", leadId);
      } catch {}

      const toE164 = normalizeUsPhoneToE164(fromUsPhone);
      // Names the agent they actually opted in to hear from.
      const unsubBrand = await agentBrandName(agentId);
      const unsubReply =
        `Thanks — you’ve been unsubscribed from ${unsubBrand} SMS follow-ups. Reply HELP for assistance.`;

      // Persist conversation.
      const { data: convoRow } = await supabaseServer
        .from("sms_conversations")
        .select("id,messages")
        .eq("contact_id", leadId)
        .maybeSingle();

      if (convoRow?.id) {
        const nextMessages = [
          ...(Array.isArray((convoRow as any).messages) ? (convoRow as any).messages : []),
          { role: "user", content: body, created_at: new Date().toISOString() },
          { role: "assistant", content: unsubReply, created_at: new Date().toISOString() },
        ];
        await supabaseServer
          .from("sms_conversations")
          .update({ messages: nextMessages, stage: "new", last_ai_reply_at: new Date().toISOString() } as any)
          .eq("id", convoRow.id);
      } else {
        await supabaseServer.from("sms_conversations").insert({
          contact_id: leadId,
          messages: [
            { role: "user", content: body },
            { role: "assistant", content: unsubReply },
          ],
          stage: "new",
          last_ai_reply_at: new Date().toISOString(),
        } as any);
      }

      if (toE164) {
        await sendSMS(toE164, unsubReply, leadId);
        try {
          await logSmsMessage({
            leadId,
            agentId,
            message: unsubReply,
            direction: "outbound",
          });
        } catch {}
      }

      return new NextResponse("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Persist / update conversation history for AI responder
    const { data: convo, error: convoErr } = await supabaseServer
      .from("sms_conversations")
      .select("id,messages,stage,last_ai_reply_at")
      .eq("contact_id", leadId)
      .maybeSingle();

    if (convoErr) throw convoErr;

    const nowIso = new Date().toISOString();
    const priorMessages = Array.isArray((convo as any)?.messages) ? (convo as any).messages : [];
    const updatedMessages = [
      ...priorMessages,
      { role: "user", content: body, created_at: nowIso },
    ];

    // A human just wrote to us — that is the moment to answer, not to go quiet.
    // The old gate blocked any reply within SMS_AI_COOLDOWN_MINUTES of our own
    // last message, so answering the AI's own question promptly got silence.
    // The window now bounds a BURST rather than muting a conversation.
    const gate = shouldAiReply(updatedMessages as ConversationMessage[], Date.now(), {
      windowMs: getSmsAiCooldownMinutes() * 60 * 1000,
    });
    const shouldReply = gate.reply;
    if (!shouldReply) {
      console.log(`[ai-sms] holding back for ${leadId}: ${gate.reason}`);
    }

    if (convo?.id) {
      await supabaseServer
        .from("sms_conversations")
        .update({ messages: updatedMessages, stage } as any)
        .eq("id", convo.id);
    } else {
      await supabaseServer.from("sms_conversations").insert({
        contact_id: leadId,
        messages: updatedMessages,
        stage,
        last_ai_reply_at: null,
      } as any);
    }

    // If we've already processed a reply once recently, only do AI responder (no re-scoring/alerts).
    if (!alreadyProcessedReply) {
      // Log engagement event in timeline.
      await supabaseServer.rpc("log_lead_event", {
        p_contact_id: leadId,
        p_event_type: "reply",
        p_metadata: { sms_body: body },
      });

      // Score: reply = +10, update rating.
      const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
        p_contact_id: leadId,
        p_delta: 10,
      } as any);

      // Stop automation for this lead.
      try {
        await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("lead_id", leadId);
      } catch {}
      await supabaseServer.from("contacts").update({ automation_disabled: true } as any).eq("id", leadId);

      if (agentId) {
        await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "replied", message: "Lead replied via SMS — nurture sequence stopped." }, supabaseServer);
      }
    }

    // High intent -> notify agent (best-effort)
    if (highIntent && agentId) {
      const { data: existingHot } = await supabaseServer
        .from("nurture_alerts")
        .select("id")
        .eq("contact_id", leadId)
        .eq("agent_id", agentId)
        .eq("type", "hot")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!existingHot?.id) {
        try {
          await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "hot", message: `High intent SMS received: "${body.slice(0, 120)}"` }, supabaseServer);
        } catch {}
      }
    }

    // Respect agent manual takeover / AI disable.
    const aiEnabled = (leadRow as any).sms_ai_enabled !== false;
    const agentTakeover = Boolean((leadRow as any).sms_agent_takeover);

    // AI reply generation + send (respect opt-in + cooldown + takeover settings)
    if (smsOptIn && aiEnabled && !agentTakeover && shouldReply) {
      const toE164 = normalizeUsPhoneToE164(fromUsPhone);
      if (toE164) {
        let recentMessages: Awaited<ReturnType<typeof getRecentSmsMessages>> = [];
        try {
          recentMessages = await getRecentSmsMessages(leadId, 8);
        } catch {}

        const assistant = await generateSmsAssistantReply({
          fromPhone: fromRaw,
          toPhone: toRaw,
          inboundBody: body,
          lead: leadRowToSnapshot(leadRow as Record<string, unknown>),
          recentMessages,
          inferredIntent: inferIntentHeuristic(body),
        });
        lastAssistant = assistant;

        try {
          if (assistant.extractedData) {
            await applySmsExtractedLeadFields(leadId, assistant.extractedData, assistant.inferredIntent);
          }
        } catch {}

        const wantsAgent =
          assistant.hotLead ||
          assistant.needsHuman ||
          assistant.nextBestAction === "notify_agent" ||
          assistant.tags.includes("human_escalation");

        if (wantsAgent && agentId) {
          const { data: existingAlert } = await supabaseServer
            .from("nurture_alerts")
            .select("id")
            .eq("contact_id", leadId)
            .eq("agent_id", agentId)
            .eq("type", "hot")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

          if (!existingAlert?.id) {
            try {
              await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "hot", message: `AI SMS escalation (${assistant.inferredIntent}): ${body.slice(0, 100)}` }, supabaseServer);
            } catch {}
          }
        }

        try {
          await supabaseServer.rpc("log_lead_event", {
            p_contact_id: leadId,
            p_event_type: "ai_sms_reply",
            p_metadata: {
              inferredIntent: assistant.inferredIntent,
              nextBestAction: assistant.nextBestAction,
              hotLead: assistant.hotLead,
              needsHuman: assistant.needsHuman,
              tags: assistant.tags,
            },
          });
        } catch {}

        const aiRequestsHuman =
          Boolean(assistant.needsHuman) || assistant.tags.includes("human_escalation");
        if (aiRequestsHuman && agentId) {
          void dispatchMobileNeedsHumanPush({
            agentId,
            leadId,
            leadName: (leadRow as { name?: string | null }).name ?? null,
            channel: "sms",
            reason: `SMS · ${assistant.inferredIntent}`,
          }).catch(() => {});
        }

        const replyBase = String(assistant.replyText ?? "").trim();
        const reply = withOptOutFooter(replyBase);

        // Keep Twilio's id: the status webhook matches on it, so without it a
        // delivery failure has no message to attach itself to and the thread
        // shows a reply that may never have arrived.
        const sent = await sendSMS(toE164, reply, leadId);
        try {
          await logSmsMessage({
            leadId,
            agentId,
            message: reply,
            direction: "outbound",
            assistantType: "sales_assistant",
            externalMessageId: sent?.sid || null,
            twilioStatus: sent?.sid ? "queued" : null,
          });
        } catch {}

        // Append assistant reply + set cooldown timestamp.
        const nextMessages = [
          ...updatedMessages,
          { role: "assistant", content: reply, created_at: nowIso },
        ];
        await supabaseServer
          .from("sms_conversations")
          .update({ messages: nextMessages, stage, last_ai_reply_at: nowIso } as any)
          .eq("contact_id", leadId);
      }
    }

    if (agentId && process.env.SMS_HOT_LEAD_AGENT_TEXT !== "false") {
      const intentForHot = lastAssistant?.inferredIntent ?? inferIntentHeuristic(body);
      const needsHumanFlag = Boolean(lastAssistant?.needsHuman || needsHumanEscalation(body));
      const hotLeadFlag = Boolean(
        lastAssistant?.hotLead ||
          highIntent ||
          lastAssistant?.tags?.includes("human_escalation")
      );
      const hot = isHotLeadFromSms({
        inferredIntent: intentForHot,
        needsHuman: needsHumanFlag,
        hotLead: hotLeadFlag,
        body,
      });
      if (hot) {
        try {
          await notifyAgentOfHotLead({
            leadId,
            reason: needsHumanFlag
              ? "Human escalation requested"
              : `Hot SMS intent: ${intentForHot}`,
            latestMessage: body,
          });
        } catch (e) {
          console.error("notifyAgentOfHotLead:", e);
        }
      }
    }

    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch {
    // Always acknowledge to avoid Twilio retries.
    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}


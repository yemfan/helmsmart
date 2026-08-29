import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendSMS } from "@/lib/twilioSms";
import { generateSmsReply } from "@/lib/smsResponderAI";
import { logSmsMessage } from "@/lib/smsAutoFollow";
import { scheduleLeadScoreRefresh } from "@/lib/lead-scoring/service";

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

export const runtime = "nodejs";

// Twilio webhook: incoming SMS for lead nurturing.
// Configure Twilio Messaging -> "A message comes in":
// POST https://<your-domain>/api/sms/webhook
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const fromRaw = String(formData.get("From") ?? "");
    const body = String(formData.get("Body") ?? "").trim();

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
        .from("leads")
        .select("id,agent_id,sms_opt_in,contact_method,rating,property_address,name,lead_status,phone")
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
        .from("leads")
        .select("id,agent_id,phone,contact_method,rating,property_address,name,lead_status")
        .eq("phone", fromUsPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leadErr2) throw leadErr2;

      leadRow = leadByPhone ?? null;

      // Additional fallback: match by digits-only if stored phone format differs.
      if (!leadRow) {
        const { data: leadByDigits, error: leadErr3 } = await supabaseServer
          .from("leads")
          .select("id,agent_id,phone,contact_method,rating,property_address,name,lead_status")
          .ilike("phone", `%${fromDigits}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (leadErr3) throw leadErr3;
        leadRow = leadByDigits ?? null;
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
    const smsOptIn =
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
        lead_id: leadId,
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
        .from("leads")
        .update({ sms_last_inbound_at: new Date().toISOString() } as any)
        .eq("id", leadId);
    } catch {}

    scheduleLeadScoreRefresh(leadId);

    const unsubscribe = isUnsubscribeMessage(body);
    const highIntent = isHighIntentMessage(body);

    // Dedupe: if we already processed a reply recently, don't double-score/alerts.
    const { data: existingReplied } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("lead_id", leadId)
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
      .eq("lead_id", leadId)
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
          .from("leads")
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
      const unsubReply =
        "Thanks — you’ve been unsubscribed from PropertyTools AI SMS follow-ups. Reply HELP for assistance.";

      // Persist conversation.
      const { data: convoRow } = await supabaseServer
        .from("sms_conversations")
        .select("id,messages")
        .eq("lead_id", leadId)
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
          lead_id: leadId,
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
      .eq("lead_id", leadId)
      .maybeSingle();

    if (convoErr) throw convoErr;

    const nowIso = new Date().toISOString();
    const priorMessages = Array.isArray((convo as any)?.messages) ? (convo as any).messages : [];
    const updatedMessages = [
      ...priorMessages,
      { role: "user", content: body, created_at: nowIso },
    ];

    const cooldownMinutes = getSmsAiCooldownMinutes();
    const lastAiAt = (convo as any)?.last_ai_reply_at ? String((convo as any).last_ai_reply_at) : null;
    const lastAiTime = lastAiAt ? new Date(lastAiAt).getTime() : 0;
    const shouldReply = !lastAiTime || Date.now() - lastAiTime >= cooldownMinutes * 60 * 1000;

    if (convo?.id) {
      await supabaseServer
        .from("sms_conversations")
        .update({ messages: updatedMessages, stage } as any)
        .eq("id", convo.id);
    } else {
      await supabaseServer.from("sms_conversations").insert({
        lead_id: leadId,
        messages: updatedMessages,
        stage,
        last_ai_reply_at: null,
      } as any);
    }

    // If we've already processed a reply once recently, only do AI responder (no re-scoring/alerts).
    if (!alreadyProcessedReply) {
      // Log engagement event in timeline.
      await supabaseServer.rpc("log_lead_event", {
        p_lead_id: leadId,
        p_event_type: "reply",
        p_metadata: { sms_body: body },
      });

      // Score: reply = +10, update rating.
      const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
        p_lead_id: leadId,
        p_delta: 10,
      } as any);

      // Stop automation for this lead.
      try {
        await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("lead_id", leadId);
      } catch {}
      await supabaseServer.from("leads").update({ automation_disabled: true } as any).eq("id", leadId);

      if (agentId) {
        await supabaseServer.from("nurture_alerts").insert({
          agent_id: agentId,
          lead_id: leadId,
          type: "replied",
          message: "Lead replied via SMS — nurture sequence stopped.",
        } as any);
      }
    }

    // High intent -> notify agent (best-effort)
    if (highIntent && agentId) {
      const { data: existingHot } = await supabaseServer
        .from("nurture_alerts")
        .select("id")
        .eq("lead_id", leadId)
        .eq("agent_id", agentId)
        .eq("type", "hot")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!existingHot?.id) {
        try {
          await supabaseServer.from("nurture_alerts").insert({
            agent_id: agentId,
            lead_id: leadId,
            type: "hot",
            message: `High intent SMS received: "${body.slice(0, 120)}"`,
          } as any);
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
        // Agent name (best-effort)
        let agentName: string | null = null;
        try {
          if (agentId) {
            const { data: agentRow } = await supabaseServer
              .from("agents")
              .select("auth_user_id")
              .eq("id", agentId)
              .maybeSingle();
            const authUserId = (agentRow as any)?.auth_user_id;
            if (authUserId) {
              const { data: profileRow } = await supabaseServer
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", authUserId)
                .maybeSingle();
              agentName = String((profileRow as any)?.full_name ?? "").trim() || null;
            }
          }
        } catch {}

        const history = updatedMessages
          .filter((m: any) => m?.role === "user" || m?.role === "assistant")
          .slice(-8)
          .map((m: any) => ({ role: m.role, content: String(m.content ?? "") }));

        const leadName = String((leadRow as any)?.name ?? "").trim() || null;

        const replyBase = await generateSmsReply({
          incomingMessage: body,
          history,
          leadName,
          propertyAddress,
          agentName,
          leadStage: stage,
        });
        const reply = withOptOutFooter(replyBase);

        await sendSMS(toE164, reply, leadId);
        try {
          await logSmsMessage({
            leadId,
            agentId,
            message: reply,
            direction: "outbound",
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
          .eq("lead_id", leadId);
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


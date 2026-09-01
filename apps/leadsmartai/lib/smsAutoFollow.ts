import { supabaseServer } from "@/lib/supabaseServer";
import { sendSMS } from "@/lib/twilioSms";
import { agentBrandName } from "@/lib/branding/agentBrand";
import { cadenceForAgent } from "@/lib/followup/cadenceForAgent";
import { renderLadderMessage } from "@/lib/followup/renderLadderMessage";
import { decideFollowUp } from "@/lib/followup/decideFollowUp";
import { moveToNurtureGroup } from "@/lib/followup/nurtureGroup";
import type { SalesCadence } from "@/lib/sales-models";

function clampMessage(message: string, maxChars = 320) {
  const clean = String(message ?? "").trim().replace(/\s+/g, " ");
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1)}…`;
}

function addCompliance(message: string) {
  const compliance = " Reply STOP to unsubscribe.";
  const body = clampMessage(message, 320 - compliance.length);
  return `${body}${compliance}`;
}

function parseCity(address: string) {
  const parts = String(address ?? "").split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts[1] : "";
}

export async function generateInitialMessage(lead: any, agent: any) {
  const leadName = String(lead?.name ?? "").trim() || "there";
  const city = String(lead?.city ?? parseCity(lead?.property_address ?? "")).trim() || "your area";
  const value = Number(lead?.estimated_home_value ?? 0);
  const agentName = String(agent?.name ?? "").trim() || "a local agent";
  const activityBits: string[] = [];
  if (Number(lead?.cma_runs ?? 0) > 0) activityBits.push("home value checks");
  if (Number(lead?.visits ?? 0) > 1) activityBits.push("recent visits");
  const activity = activityBits.length ? activityBits.join(" and ") : "recent market activity";
  const valueText = value > 0 ? ` around $${Math.round(value).toLocaleString()}` : "";
  const prompt = `Write one natural SMS under 2 sentences, not salesy, for a real-estate lead.
Lead name: ${leadName}
City: ${city}
Activity: ${activity}
Estimated home value: ${valueText || "unknown"}
Agent name: ${agentName}
Must ask one soft question at the end.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `Hi ${leadName}, this is ${agentName}. I noticed your ${activity} in ${city}${valueText ? ` (home value${valueText})` : ""} and wanted to share local context if helpful — would you like a quick, no-pressure estimate update?`;
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages: [
          { role: "system", content: "You write friendly, concise SMS for real-estate leads." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error("AI request failed");
    const json = (await res.json()) as any;
    const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) throw new Error("Empty AI response");
    return content;
  } catch {
    return `Hi ${leadName}, this is ${agentName}. I noticed your ${activity} in ${city}${valueText ? ` (home value${valueText})` : ""} and wanted to share local context if helpful — would you like a quick, no-pressure estimate update?`;
  }
}

export async function logSmsMessage(input: {
  leadId: string | number;
  agentId?: string | null;
  message: string;
  direction: "inbound" | "outbound";
  /** Which AI assistant sent this (outbound only) — drives timeline attribution. */
  assistantType?: string | null;
  /**
   * Twilio's id and status for an outbound message.
   *
   * Two senders write to sms_messages: sendOutboundSms records these, and this
   * function did not — so every AI reply landed with external_message_id null
   * and twilio_status null. The row said the message existed and nothing said
   * whether it arrived, which reads exactly like a message that was never sent.
   * The status webhook keys off external_message_id, so without it a delivery
   * failure could never be attached to the message that failed.
   */
  externalMessageId?: string | null;
  twilioStatus?: string | null;
}) {
  await supabaseServer.from("sms_messages").insert({
    contact_id: input.leadId as any,
    agent_id: input.agentId ?? null,
    message: clampMessage(input.message, 500),
    direction: input.direction,
    assistant_type: input.assistantType ?? null,
    external_message_id: input.externalMessageId ?? null,
    twilio_status: input.twilioStatus ?? null,
  } as any);
}

export async function sendInitialSmsAfterPurchase(leadId: string | number) {
  const { data: lead } = await supabaseServer
    .from("contacts")
    .select("id,agent_id,name,city,property_address,estimated_home_value,phone,sms_opt_in,sms_ai_enabled,sms_agent_takeover")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, reason: "lead_not_found" };

  const smsOptIn = Boolean((lead as any).sms_opt_in);
  if (!smsOptIn) return { ok: false, reason: "sms_not_opted_in" };
  if ((lead as any).sms_ai_enabled === false || (lead as any).sms_agent_takeover === true) {
    return { ok: false, reason: "ai_disabled_or_takeover" };
  }

  const phone = String((lead as any).phone ?? "").trim();
  if (!phone) return { ok: false, reason: "missing_phone" };

  let agentName = "";
  try {
    const { data: agentRow } = await supabaseServer
      .from("agents")
      .select("auth_user_id")
      .eq("id", (lead as any).agent_id)
      .maybeSingle();
    const authUserId = (agentRow as any)?.auth_user_id;
    if (authUserId) {
      const { data: profile } = await supabaseServer
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", authUserId)
        .maybeSingle();
      agentName = String((profile as any)?.full_name ?? "").trim();
    }
  } catch {}

  const initial = await generateInitialMessage(
    {
      name: (lead as any).name,
      city: (lead as any).city,
      property_address: (lead as any).property_address,
      estimated_home_value: (lead as any).estimated_home_value,
      cma_runs: 1,
      visits: 1,
    },
    { name: agentName }
  );

  const finalMsg = addCompliance(initial);
  await sendSMS(phone, finalMsg, String((lead as any).id));
  await logSmsMessage({
    leadId: String((lead as any).id),
    agentId: String((lead as any).agent_id ?? ""),
    message: finalMsg,
    direction: "outbound",
  });
  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("contacts")
    .update({ sms_followup_stage: 1, sms_last_outbound_at: nowIso } as any)
    .eq("id", (lead as any).id);

  return { ok: true };
}

export async function runSmsFollowupCron() {
  let leads: any[] | null = null;
  let error: any = null;
  let legacyMode = false;
  try {
    const res = await supabaseServer
      .from("contacts")
      .select("id,agent_id,name,city,property_address,estimated_home_value,phone,sms_opt_in,sms_ai_enabled,sms_agent_takeover,sms_followup_stage,sms_last_outbound_at,sms_last_inbound_at,engagement_score,sms_opted_out_at")
      .eq("sms_opt_in", true)
      .eq("sms_ai_enabled", true)
      .eq("sms_agent_takeover", false)
      // Was 4, the old three-template ceiling. Ladders are per-model now;
      // 12 is the largest hardStopAfterUnanswered we ship, so nobody is
      // excluded from the query before decideFollowUp gets a look at them.
      .lt("sms_followup_stage", 12)
      .limit(1000);
    leads = (res.data as any[]) ?? null;
    error = res.error;
  } catch (e) {
    error = e;
  }
  if (error) {
    // Legacy schema fallback where sms columns may not exist.
    const res = await supabaseServer
      .from("contacts")
      .select("id,agent_id,name,city,property_address,estimated_home_value,phone,contact_method,sms_followup_stage,sms_last_outbound_at,sms_last_inbound_at")
      .limit(1000);
    leads = (res.data as any[]) ?? null;
    error = res.error;
    legacyMode = true;
  }
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let nurtured = 0;
  // One lookup per agent, not per lead — a cron pass covers many contacts
  // belonging to the same handful of agents.
  const cadenceCache = new Map<string, SalesCadence>();
  for (const lead of leads ?? []) {
    if (legacyMode) {
      // Legacy behavior: infer opt-in from contact_method when sms_opt_in and AI flags are missing.
      const method = String((lead as any).contact_method ?? "").toLowerCase();
      const smsAllowed = method === "sms" || method === "both";
      if (!smsAllowed) {
        skipped += 1;
        continue;
      }
    }
    const stage = Number((lead as any).sms_followup_stage ?? 0);
    if (stage <= 0) {
      skipped += 1;
      continue;
    }
    const lastOut = (lead as any).sms_last_outbound_at
      ? new Date(String((lead as any).sms_last_outbound_at)).getTime()
      : 0;
    const lastIn = (lead as any).sms_last_inbound_at
      ? new Date(String((lead as any).sms_last_inbound_at)).getTime()
      : 0;
    if (!lastOut) {
      skipped += 1;
      continue;
    }
    // If inbound happened after last outbound, conversation is active; stop follow-ups.
    if (lastIn && lastIn > lastOut) {
      skipped += 1;
      continue;
    }

    const agentId = String((lead as any).agent_id ?? "");
    let cadence = cadenceCache.get(agentId);
    if (!cadence) {
      cadence = await cadenceForAgent(agentId);
      cadenceCache.set(agentId, cadence);
    }

    // Past the end of the ladder there is nothing left to say, so the question
    // stops being "when" and becomes "at all". Engagement decides: someone who
    // never replies but keeps opening listings is reading, not gone.
    if (stage > cadence.ladderMessages.length) {
      const decision = decideFollowUp({
        unanswered: stage - 1,
        engagementScore: Number((lead as any).engagement_score ?? 0),
        cadence,
        optedOut: Boolean((lead as any).sms_opted_out_at),
      });
      if (decision.decision === "nurture" && agentId) {
        // Idempotent — this branch is reached on every pass once the ladder is
        // spent, and only the first one actually moves them.
        if (await moveToNurtureGroup({ contactId: String((lead as any).id), agentId, reason: decision.reason })) {
          nurtured += 1;
        }
      }
      skipped += 1;
      continue;
    }

    // Ladder entries are GAPS since the previous touch, which is what this cron
    // has always measured — [1, 3, 7] is tomorrow, three days after that, then a
    // week after that.
    const waitDays = cadence.hotLadderDays[stage - 1] ?? cadence.hotLadderDays.at(-1) ?? 7;
    const elapsedHrs = (Date.now() - lastOut) / (1000 * 60 * 60);
    if (elapsedHrs < waitDays * 24) {
      skipped += 1;
      continue;
    }

    const leadName = String((lead as any).name ?? "").trim() || "there";
    const city = String((lead as any).city ?? parseCity((lead as any).property_address ?? "")).trim() || "your area";
    // The lead hears from their agent, not from the software.
    const brand = await agentBrandName(agentId);
    // Copy comes from the chosen sales model, so an Advisor and a Closer no
    // longer send word-for-word identical texts while claiming different styles.
    const template = cadence.ladderMessages[stage - 1] ?? cadence.ladderMessages[0];
    const msg = addCompliance(renderLadderMessage(template, { name: leadName, city, brand }));
    const phone = String((lead as any).phone ?? "").trim();
    if (!phone) {
      skipped += 1;
      continue;
    }
    await sendSMS(phone, msg, String((lead as any).id));
    await logSmsMessage({
      leadId: String((lead as any).id),
      agentId: String((lead as any).agent_id ?? ""),
      message: msg,
      direction: "outbound",
    });
    await supabaseServer
      .from("contacts")
      .update({
        sms_followup_stage: stage + 1,
        sms_last_outbound_at: new Date().toISOString(),
      } as any)
      .eq("id", (lead as any).id);
    sent += 1;
  }

  return { sent, skipped, nurtured };
}

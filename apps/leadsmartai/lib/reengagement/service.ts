import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendOutboundEmail } from "@/lib/ai-email/send";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { canSendGreeting } from "@/lib/greetings/compliance";
import type { GreetingLead } from "@/lib/greetings/types";
import { recomputeDealPredictionForLead } from "@/lib/dealPrediction/service";
import { generateReengagementMessage } from "./ai";
import { isColdLead } from "./coldLead";
import { FOLLOW_UP_SEQUENCE } from "./sequence";
import type {
  ReengagementCampaignRow,
  ReengagementChannel,
  ReengagementLead,
  ReengagementMessageRow,
  ReengagementTriggerType,
} from "./types";

const DAY_MS = 86400000;

const leadSelect = [
  "id",
  "agent_id",
  "name",
  "email",
  "phone",
  "phone",
  "property_address",
  "city",
  "state",
  "last_contacted_at",
  "last_activity_at",
  "contact_opt_out_sms",
  "contact_opt_out_email",
  "sms_opt_in",
  "preferred_contact_channel",
  "merged_into_lead_id",
].join(",");

function mapRow(row: Record<string, unknown>): ReengagementLead {
  const phone =
    String((row.phone as string) || "").trim() || null;
  return {
    id: String(row.id),
    agentId: row.agent_id != null ? String(row.agent_id) : null,
    name: (row.name as string) ?? null,
    email: (row.email as string) ?? null,
    phone,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    propertyAddress: (row.property_address as string) ?? null,
    lastContactedAt: (row.last_contacted_at as string) ?? null,
    lastActivityAt: (row.last_activity_at as string) ?? null,
    contactOptOutSms: Boolean(row.contact_opt_out_sms),
    contactOptOutEmail: Boolean(row.contact_opt_out_email),
    smsOptIn: typeof row.sms_opt_in === "boolean" ? row.sms_opt_in : undefined,
    preferredContactChannel: (row.preferred_contact_channel as string) ?? null,
    mergedIntoLeadId: row.merged_into_lead_id != null ? String(row.merged_into_lead_id) : null,
    predictionScore: (() => {
      const v = row.prediction_score;
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })(),
    predictionLabel: row.prediction_label != null ? String(row.prediction_label) : null,
  };
}

function toGreetingLead(lead: ReengagementLead): GreetingLead {
  return {
    id: lead.id,
    assignedAgentId: lead.agentId,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    address: lead.propertyAddress,
    city: lead.city,
    state: lead.state,
    birthday: null,
    homePurchaseDate: null,
    preferredContactChannel: lead.preferredContactChannel,
    relationshipStage: null,
    contactOptOutSms: lead.contactOptOutSms,
    contactOptOutEmail: lead.contactOptOutEmail,
    smsOptIn: lead.smsOptIn,
    lastContactedAt: lead.lastContactedAt,
    leadTemperature: null,
    leadTags: [],
  };
}

function parseCampaign(row: Record<string, unknown>): ReengagementCampaignRow {
  return {
    id: String(row.id),
    name: (row.name as string) ?? null,
    agent_id: String(row.agent_id),
    status: String(row.status),
    channel: (row.channel as ReengagementChannel) || "sms",
    trigger_type: (row.trigger_type as ReengagementTriggerType) || "cold_lead",
    days_inactive: Number(row.days_inactive ?? 30),
    max_per_run: Number(row.max_per_run ?? 25),
    use_ai: row.use_ai !== false,
  };
}

function parseMessage(row: Record<string, unknown>): ReengagementMessageRow {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    step_number: Number(row.step_number),
    delay_days: Number(row.delay_days ?? 0),
    step_type: String(row.step_type ?? "nudge"),
    template: (row.template as string) ?? null,
  };
}

export async function listActiveCampaigns(agentId?: string): Promise<ReengagementCampaignRow[]> {
  let q = supabaseAdmin.from("reengagement_campaigns").select("*").eq("status", "active");
  if (agentId) q = q.eq("agent_id", agentId as any);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => parseCampaign(r as Record<string, unknown>));
}

export async function listMessagesForCampaign(campaignId: string): Promise<ReengagementMessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("reengagement_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_number", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => parseMessage(r as Record<string, unknown>));
}

export async function listLeadsForAgent(agentId: string, limit = 500) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(leadSelect)
    .eq("agent_id", agentId as any)
    .is("merged_into_lead_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const mapped = (data || []).map((r) => mapRow(r as unknown as Record<string, unknown>));
  mapped.sort((a, b) => (b.predictionScore ?? -1) - (a.predictionScore ?? -1));
  return mapped;
}

async function fetchLogs(leadId: string, campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("reengagement_logs")
    .select("step_number,status,created_at")
    .eq("contact_id", leadId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function sequenceStartTime(
  logs: { step_number: number; status: string; created_at: string }[]
): number | null {
  const first = logs.find((l) => l.step_number === 0 && l.status === "sent");
  if (!first?.created_at) return null;
  const t = new Date(first.created_at).getTime();
  return Number.isNaN(t) ? null : t;
}

function sentStepSet(logs: { step_number: number; status: string }[]): Set<number> {
  const s = new Set<number>();
  for (const l of logs) {
    if (l.status === "sent") s.add(l.step_number);
  }
  return s;
}

function pickNextMessage(
  lead: ReengagementLead,
  campaign: ReengagementCampaignRow,
  messages: ReengagementMessageRow[],
  logs: { step_number: number; status: string; created_at: string }[]
): ReengagementMessageRow | null {
  if (!messages.length) return null;

  const cold = isColdLead(lead, campaign.days_inactive, campaign.trigger_type);
  if (!cold) return null;

  const sent = sentStepSet(logs);
  const t0 = sequenceStartTime(logs);
  const now = Date.now();

  for (const m of messages) {
    const prevSteps = messages.filter((x) => x.step_number < m.step_number).map((x) => x.step_number);
    const prereqOk = prevSteps.every((n) => sent.has(n));
    if (!prereqOk) continue;
    if (sent.has(m.step_number)) continue;

    if (m.step_number === 0) return m;

    if (t0 == null) continue;
    const due = t0 + m.delay_days * DAY_MS;
    if (now >= due) return m;
  }

  return null;
}

async function insertLog(params: {
  leadId: string;
  campaignId: string;
  stepNumber: number;
  channel: ReengagementChannel;
  status: "sent" | "skipped" | "failed";
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("reengagement_logs").insert({
    contact_id: params.leadId,
    campaign_id: params.campaignId,
    step_number: params.stepNumber,
    channel: params.channel,
    status: params.status,
    body: params.body,
    metadata_json: params.metadata ?? {},
  } as Record<string, unknown>);
  if (error) throw error;
}

async function logLeadEvent(leadId: string, metadata: Record<string, unknown>) {
  try {
    await supabaseAdmin.rpc("log_lead_event", {
      p_contact_id: leadId,
      p_event_type: "reengagement_sent",
      p_metadata: { ...metadata, source: "reengagement_engine" },
    });
  } catch {
    /* optional */
  }
}

export type ReengagementJobResult = {
  campaignId: string;
  leadId: string;
  stepNumber: number;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

export async function runReengagementJob(opts?: { agentId?: string }): Promise<ReengagementJobResult[]> {
  const campaigns = await listActiveCampaigns(opts?.agentId);
  const results: ReengagementJobResult[] = [];

  for (const campaign of campaigns) {
    const messages = await listMessagesForCampaign(campaign.id);
    if (!messages.length) continue;

    const leads = await listLeadsForAgent(campaign.agent_id, 800);
    let sentThisRun = 0;

    for (const lead of leads) {
      if (sentThisRun >= campaign.max_per_run) break;
      if (String(lead.agentId) !== String(campaign.agent_id)) continue;
      if (lead.mergedIntoLeadId) continue;

      const logs = await fetchLogs(lead.id, campaign.id);
      const next = pickNextMessage(lead, campaign, messages, logs as any);
      if (!next) continue;

      const channel = campaign.channel;
      const compliance = canSendGreeting(toGreetingLead(lead), channel);
      if (!compliance.allowed) {
        await insertLog({
          leadId: lead.id,
          campaignId: campaign.id,
          stepNumber: next.step_number,
          channel,
          status: "skipped",
          body: "",
          metadata: { reason: compliance.reason },
        });
        results.push({
          campaignId: campaign.id,
          leadId: lead.id,
          stepNumber: next.step_number,
          status: "skipped",
          reason: compliance.reason || undefined,
        });
        continue;
      }

      const generated = await generateReengagementMessage({
        lead,
        channel,
        stepType: next.step_type,
        templateHint: next.template,
        useAi: campaign.use_ai,
      });

      try {
        if (channel === "sms") {
          const to = (lead.phone || "").trim();
          if (!to) throw new Error("missing_phone");
          await sendOutboundSms({
            leadId: lead.id,
            to,
            body: generated.body,
            agentId: lead.agentId,
            actorType: "system",
            actorName: "LeadSmart AI Re-engagement",
          });
        } else {
          const to = (lead.email || "").trim();
          if (!to) throw new Error("missing_email");
          await sendOutboundEmail({
            leadId: lead.id,
            to,
            subject: generated.subject || "Quick check-in",
            body: generated.body,
            agentId: lead.agentId,
            actorType: "system",
            actorName: "LeadSmart AI Re-engagement",
          });
        }

        await insertLog({
          leadId: lead.id,
          campaignId: campaign.id,
          stepNumber: next.step_number,
          channel,
          status: "sent",
          body: generated.body,
          metadata: { stepType: next.step_type, channel },
        });

        await logLeadEvent(lead.id, {
          campaignId: campaign.id,
          stepNumber: next.step_number,
          channel,
        });

        sentThisRun += 1;
        results.push({
          campaignId: campaign.id,
          leadId: lead.id,
          stepNumber: next.step_number,
          status: "sent",
        });

        void recomputeDealPredictionForLead(lead.id).catch(() => {
          /* non-blocking refresh after touchpoint */
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "send_failed";
        await insertLog({
          leadId: lead.id,
          campaignId: campaign.id,
          stepNumber: next.step_number,
          channel,
          status: "failed",
          body: generated.body,
          metadata: { error: msg },
        });
        results.push({
          campaignId: campaign.id,
          leadId: lead.id,
          stepNumber: next.step_number,
          status: "failed",
          reason: msg,
        });
      }
    }
  }

  return results;
}

export async function bootstrapDefaultCampaign(agentId: string) {
  const { count, error: cErr } = await supabaseAdmin
    .from("reengagement_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId as any);

  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    return { created: false as const, reason: "already_has_campaigns" as const };
  }

  const { data: campaign, error: insErr } = await supabaseAdmin
    .from("reengagement_campaigns")
    .insert({
      name: "Cold lead revival (default)",
      agent_id: agentId as any,
      status: "active",
      channel: "sms",
      trigger_type: "cold_lead",
      days_inactive: 30,
      max_per_run: 25,
      use_ai: true,
    } as Record<string, unknown>)
    .select("id")
    .single();

  if (insErr) throw insErr;
  const campaignId = String((campaign as { id: string }).id);

  const rows = FOLLOW_UP_SEQUENCE.map((s, idx) => ({
    campaign_id: campaignId,
    step_number: idx,
    delay_days: s.day,
    step_type: s.type,
    template:
      s.type === "initial"
        ? "First touch: warm check-in, offer help with their search."
        : s.type === "nudge"
          ? "Gentle nudge; acknowledge silence; invite a short reply."
          : "Final polite attempt; easy out; no pressure.",
  }));

  const { error: mErr } = await supabaseAdmin.from("reengagement_messages").insert(rows as any);
  if (mErr) throw mErr;

  return { created: true as const, campaignId };
}

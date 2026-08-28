import { supabaseAdmin } from "@/lib/supabase/admin";
import { dispatchMobileHotLeadPush } from "@/lib/mobile/pushNotificationsService";
import { normalizeToE164, sendOutboundSms } from "./outbound";
import { EMAIL_BRAND } from "@/lib/email";

const DEDUPE_HOURS = 6;

/** SMS or mobile hot-lead push in the dedupe window counts as “already notified”. */
async function wasHotLeadAgentAlertRecent(leadId: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("contact_events")
    .select("id")
    .eq("contact_id", leadId)
    .in("event_type", ["hot_lead_agent_sms_sent", "mobile_push_hot_lead"])
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

export type AssignedAgentContact = {
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    phone_number: string | null;
    property_address: string | null;
    agent_id: string | null;
  };
  agent: {
    id: string;
    auth_user_id: string | null;
  };
  profile: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

export async function getAssignedAgentContact(leadId: string): Promise<AssignedAgentContact | null> {
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("contacts")
    .select("id,agent_id,name,phone,phone_number,property_address")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) return null;
  const agentId = lead.agent_id != null ? String(lead.agent_id) : null;
  if (!agentId) return null;

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("agents")
    .select("id,auth_user_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) return null;

  const authUserId = (agent as { auth_user_id?: string | null }).auth_user_id;
  let profile: AssignedAgentContact["profile"] = null;
  if (authUserId) {
    const { data: prof } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name,phone,email")
      .eq("user_id", authUserId)
      .maybeSingle();
    profile = prof ?? null;
  }

  return {
    lead: {
      id: String(lead.id),
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      phone_number: (lead as { phone_number?: string | null }).phone_number ?? null,
      property_address: lead.property_address ?? null,
      agent_id: agentId,
    },
    agent: { id: String((agent as { id: unknown }).id), auth_user_id: authUserId ?? null },
    profile,
  };
}

/** Hot-lead SMS + mobile push to the assigned agent (6h dedupe). */
export type NotifyAgentOfHotLeadParams = {
  leadId: string;
  reason: string;
  latestMessage: string;
  /** Defaults to SMS pipeline metadata; use `ai_voice` for Twilio Voice hot leads. */
  source?: "ai_sms" | "ai_voice";
};

export async function notifyAgentOfHotLead(params: NotifyAgentOfHotLeadParams) {
  const source = params.source ?? "ai_sms";
  if (await wasHotLeadAgentAlertRecent(params.leadId)) {
    return { notified: false, reason: "recently_notified" as const };
  }

  const contact = await getAssignedAgentContact(params.leadId);
  if (!contact) {
    try {
      await supabaseAdmin.from("contact_events").insert({
        contact_id: params.leadId,
        agent_id: null,
        event_type: "hot_lead_agent_notify_skipped",
        metadata: { reason: "no_assigned_agent", source },
      } as Record<string, unknown>);
    } catch {
      // ignore
    }
    return { notified: false, reason: "no_assigned_agent" as const };
  }

  const leadPhone = contact.lead.phone_number || contact.lead.phone;
  const pushTitle = `Hot lead — ${EMAIL_BRAND}`;
  const pushBody = [
    contact.lead.name ? contact.lead.name : `Lead ${params.leadId}`,
    params.reason,
    params.latestMessage.slice(0, 100),
  ]
    .filter(Boolean)
    .join(" · ");

  let mobilePushed = false;
  if (contact.agent.auth_user_id) {
    try {
      mobilePushed = await dispatchMobileHotLeadPush({
        userId: contact.agent.auth_user_id,
        agentId: contact.agent.id,
        leadId: params.leadId,
        title: pushTitle,
        body: pushBody.slice(0, 200),
      });
    } catch {
      // ignore
    }
  }

  if (process.env.SMS_HOT_LEAD_AGENT_TEXT === "false") {
    return mobilePushed
      ? ({ notified: true as const, channel: "push" as const } as const)
      : ({ notified: false, reason: "disabled" as const } as const);
  }

  const agentPhone = contact.profile?.phone?.trim();
  const agentE164 = agentPhone ? normalizeToE164(agentPhone) : null;
  if (!agentE164) {
    try {
      await supabaseAdmin.from("contact_events").insert({
        contact_id: params.leadId,
        agent_id: contact.agent.id,
        event_type: "hot_lead_agent_notify_skipped",
        metadata: { reason: "no_agent_phone", source },
      } as Record<string, unknown>);
    } catch {
      // ignore
    }
    return mobilePushed
      ? ({ notified: true as const, channel: "push" as const } as const)
      : ({ notified: false, reason: "no_agent_phone" as const } as const);
  }

  const body = [
    `Hot lead (${EMAIL_BRAND})`,
    contact.lead.name ? `Lead: ${contact.lead.name}` : `Lead ID: ${params.leadId}`,
    leadPhone ? `Phone: ${leadPhone}` : null,
    contact.lead.property_address ? `Property: ${contact.lead.property_address}` : null,
    `Reason: ${params.reason}`,
    `Latest: ${params.latestMessage.slice(0, 120)}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendOutboundSms({
    leadId: params.leadId,
    to: agentE164,
    body,
    agentId: contact.agent.id,
    actorType: "system",
    actorName: `${EMAIL_BRAND} Alert`,
    // To the agent, about the contact — not to the contact.
    internal: true,
  });

  try {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: params.leadId,
      agent_id: contact.agent.id,
      event_type: "hot_lead_agent_sms_sent",
      metadata: {
        reason: params.reason,
        agentPhone: agentE164,
        source,
      },
    } as Record<string, unknown>);
  } catch {
    // ignore
  }

  return { notified: true as const, channel: "sms" as const };
}

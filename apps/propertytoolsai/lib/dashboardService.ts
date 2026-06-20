import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getLeadLimit } from "@/lib/planLimits";
import { toErrorFromSupabase } from "@/lib/supabaseError";

/**
 * CRM tables (`leads`, `communications`, …) use `agent_id` → `public.agents.id` (bigint).
 * When no `agents` row exists, `agentId` is `""` — never use `userId` (UUID) as `agentId` for CRM bigint columns.
 * Only digit-only strings are safe for bigint `agent_id` filters (avoids 22P02 / empty PostgREST messages).
 */
export function isNumericCrmAgentId(agentId: unknown): boolean {
  const s = String(agentId ?? "").trim();
  return /^\d+$/.test(s);
}

/** @deprecated use !isNumericCrmAgentId(agentId) for CRM queries */
export function isAuthUserIdFallbackAsAgentId(agentId: string): boolean {
  return !isNumericCrmAgentId(agentId);
}

export type LeadStatus = "new" | "contacted" | "qualified" | "closed";

export type LeadRating = "hot" | "warm" | "cold";
export type ContactFrequency = "daily" | "weekly" | "monthly";
export type ContactMethod = "email" | "sms" | "both";

export type LeadRow = {
  id: string;
  agent_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  source: string | null;
  lead_status: LeadStatus;
  notes: string | null;
  engagement_score?: number | null;
  lead_score?: number | null;
  lead_temperature?: string | null;
  last_activity_at?: string | null;
  rating?: LeadRating | string | null;
  contact_frequency?: ContactFrequency | string | null;
  contact_method?: ContactMethod | string | null;
  last_contacted_at?: string | null;
  next_contact_at?: string | null;
  search_location: string | null;
  search_radius: number | null;
  price_min: number | null;
  price_max: number | null;
  beds: number | null;
  baths: number | null;
  created_at: string;
  ai_lead_score?: number | null;
  ai_intent?: string | null;
  ai_timeline?: string | null;
  ai_confidence?: number | null;
  ai_explanation?: string[] | null;
};

function addInterval(baseIso: string, freq: ContactFrequency) {
  const d = new Date(baseIso);
  if (freq === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export type ContactRow = {
  id: string;
  agent_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  type: "buyer" | "seller" | string | null;
  created_at: string;
};

type AgentRow = {
  id: string;
  user_id: string;
  plan_type: "free" | "pro" | "elite" | string;
};

export async function getCurrentAgentContext(): Promise<{
  userId: string;
  agentId: string;
  planType: AgentRow["plan_type"];
  email: string | null;
}> {
  const supabase = supabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    const raw =
      typeof (userErr as { message?: string }).message === "string"
        ? (userErr as { message: string }).message.trim()
        : "";
    throw new Error(raw || "Not authenticated");
  }
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  // Prefer agents.auth_user_id mapping (Supabase Auth UUID).
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id,auth_user_id,plan_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (agentErr && (agentErr as { code?: string }).code !== "PGRST116") {
    const raw =
      typeof (agentErr as { message?: string }).message === "string"
        ? (agentErr as { message: string }).message.trim()
        : "";
    throw new Error(raw || "Unable to load agent profile");
  }

  const rawAgentPk = (agent as any)?.id;
  const agentId =
    rawAgentPk != null && rawAgentPk !== "" ? String(rawAgentPk) : "";

  return {
    userId: user.id,
    /** Numeric `public.agents.id` for CRM tables (`leads`, `tasks`, …). Empty if no `agents` row. */
    agentId,
    planType: ((agent as any)?.plan_type ?? "free") as AgentRow["plan_type"],
    email: user.email ?? null,
  };
}

function applyFreePlanLimit<T>(rows: T[], planType: string, limit = 20) {
  if (planType === "free") return rows.slice(0, limit);
  return rows;
}

export async function getLeadUsageThisMonth(): Promise<{
  used: number;
  limit: number;
  planType: string;
}> {
  const { agentId, planType } = await getCurrentAgentContext();
  const supabase = supabaseServerClient();

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const limit = getLeadLimit(planType);
  if (!isNumericCrmAgentId(agentId)) {
    return { used: 0, limit, planType };
  }

  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", start.toISOString());

  if (error) throw toErrorFromSupabase(error, "Could not load lead usage");

  return { used: count ?? 0, limit, planType };
}

export async function getLeads(params?: {
  lead_status?: LeadStatus;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<LeadRow[]> {
  const { agentId, planType } = await getCurrentAgentContext();
  if (!isNumericCrmAgentId(agentId)) {
    return [];
  }
  const supabase = supabaseServerClient();

  let q = supabase
    .from("leads")
    .select(
      "id,agent_id,name,email,phone,property_address,source,lead_status,notes,engagement_score,lead_score,lead_temperature,last_activity_at,nurture_score,rating,contact_frequency,contact_method,last_contacted_at,next_contact_at,search_location,search_radius,price_min,price_max,beds,baths,created_at"
    )
    .eq("agent_id", agentId)
    .order("lead_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (params?.lead_status) q = q.eq("lead_status", params.lead_status);
  if (params?.source) q = q.eq("source", params.source);
  if (params?.search?.trim()) {
    const s = params.search.trim();
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  if (typeof params?.offset === "number" && typeof params?.limit === "number") {
    q = q.range(params.offset, params.offset + params.limit - 1);
  } else {
    q = q.limit(params?.limit ?? 100);
  }

  const { data, error } = await q;
  if (error) throw toErrorFromSupabase(error, "Could not load leads");
  const leads = (data as LeadRow[]) ?? [];
  const leadIds = leads.map((l) => l.id).filter(Boolean);
  let scoreMap: Record<string, any> = {};
  if (leadIds.length) {
    const { data: scoreRows } = await supabase
      .from("lead_scores")
      .select("lead_id,score,intent,timeline,confidence,explanation,updated_at")
      .in("lead_id", leadIds as any)
      .order("updated_at", { ascending: false })
      .limit(5000);
    for (const row of scoreRows ?? []) {
      const key = String((row as any).lead_id ?? "");
      if (!key || scoreMap[key]) continue;
      scoreMap[key] = row;
    }
  }

  const hydrated = leads.map((l) => {
    const s = scoreMap[String(l.id)] as any;
    return {
      ...l,
      ai_lead_score: s ? Number(s.score ?? 0) : null,
      ai_intent: s?.intent ?? null,
      ai_timeline: s?.timeline ?? null,
      ai_confidence: s ? Number(s.confidence ?? 0) : null,
      ai_explanation: Array.isArray(s?.explanation) ? s.explanation : [],
    } as LeadRow;
  });

  return applyFreePlanLimit(hydrated, planType);
}

export async function getContacts(limit = 200): Promise<ContactRow[]> {
  const { agentId } = await getCurrentAgentContext();
  if (!isNumericCrmAgentId(agentId)) {
    return [];
  }
  const supabase = supabaseServerClient();

  const { data, error } = await supabase
    .from("contacts")
    .select("id,agent_id,name,email,phone,address,type,created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw toErrorFromSupabase(error, "Could not load contacts");
  return (data as ContactRow[]) ?? [];
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const { agentId } = await getCurrentAgentContext();
  if (!isNumericCrmAgentId(agentId)) {
    throw new Error("No agent profile is linked to this account. Complete onboarding to use the CRM.");
  }
  const supabase = supabaseServerClient();

  const { error } = await supabase
    .from("leads")
    .update({ lead_status: status })
    .eq("id", id)
    .eq("agent_id", agentId);

  if (error) throw toErrorFromSupabase(error, "Could not update lead status");
}

export async function updateLeadNotes(id: string, notes: string) {
  const { agentId } = await getCurrentAgentContext();
  if (!isNumericCrmAgentId(agentId)) {
    throw new Error("No agent profile is linked to this account. Complete onboarding to use the CRM.");
  }
  const supabase = supabaseServerClient();

  const { error } = await supabase
    .from("leads")
    .update({ notes })
    .eq("id", id)
    .eq("agent_id", agentId);

  if (error) throw toErrorFromSupabase(error, "Could not update lead notes");
}

export async function updateLeadFollowUpSettings(
  id: string,
  next: {
    rating?: LeadRating;
    contact_frequency?: ContactFrequency;
    contact_method?: ContactMethod;
  }
) {
  const { agentId } = await getCurrentAgentContext();
  if (!isNumericCrmAgentId(agentId)) {
    throw new Error("No agent profile is linked to this account. Complete onboarding to use the CRM.");
  }
  const supabase = supabaseServerClient();

  const updatePayload: any = {};
  if (next.rating) updatePayload.rating = next.rating;
  if (next.contact_frequency) updatePayload.contact_frequency = next.contact_frequency;
  if (next.contact_method) updatePayload.contact_method = next.contact_method;

  // Respect SMS consent: only send SMS when contact_method includes SMS.
  if (next.contact_method) {
    const m = next.contact_method;
    updatePayload.sms_opt_in = m === "sms" || m === "both";
  }

  if (next.contact_frequency) {
    updatePayload.next_contact_at = addInterval(new Date().toISOString(), next.contact_frequency);
  }

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", id)
    .eq("agent_id", agentId);

  if (error) throw toErrorFromSupabase(error, "Could not update lead follow-up settings");
}


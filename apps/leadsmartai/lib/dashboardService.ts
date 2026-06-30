import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { getAgentScopeForAgent } from "@/lib/teams/scope.server";
import {
  CONTACT_SCORES_SELECT,
  unpackScoreRow,
} from "@/lib/contactScores";
import { getLeadLimit } from "@/lib/planLimits";
import { throwIfSupabaseError } from "@/lib/supabaseThrow";
import { ERROR_DASHBOARD_NO_AGENT_ROW } from "@leadsmart/shared";
import type {
  ContactFrequency,
  ContactMethod,
  CrmContactRow,
  CrmLeadRow,
  LeadRating,
  LeadStatus,
} from "@leadsmart/shared";

export { ERROR_DASHBOARD_NO_AGENT_ROW };
export type { ContactFrequency, ContactMethod, LeadRating, LeadStatus };
/** Alias for {@link CrmLeadRow} from `@leadsmart/shared` (dashboard Supabase row). */
export type LeadRow = CrmLeadRow;
/** Alias for {@link CrmContactRow} from `@leadsmart/shared`. */
export type ContactRow = CrmContactRow;

function addInterval(baseIso: string, freq: ContactFrequency) {
  const d = new Date(baseIso);
  if (freq === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

type AgentRow = {
  id: string;
  user_id: string;
  plan_type: "free" | "pro" | "elite" | string;
};

export async function getCurrentAgentContext(authUser?: {
  id: string;
  email?: string | null;
}): Promise<{
  userId: string;
  agentId: string;
  planType: AgentRow["plan_type"];
  email: string | null;
}> {
  const supabase = supabaseServerClient();

  // When the caller has already resolved the authenticated user (e.g. a tool
  // route that gated via `getUserFromRequest`, which is Bearer-aware), reuse
  // that identity instead of re-reading the cookie session here. Otherwise the
  // gate and the data lookup are two independent identity sources and a request
  // carrying a Bearer ≠ cookie would deduct tokens from one user but read/write
  // another's data. See lib/authFromRequest.ts.
  let user: { id: string; email?: string | null } | null = authUser ?? null;
  if (!user) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      const m = typeof userErr.message === "string" ? userErr.message.trim() : "";
      throw new Error(m || "Unable to verify your session");
    }
    user = userData.user;
  }
  if (!user) throw new Error("Not authenticated");

  // Prefer agents.auth_user_id mapping (Supabase Auth UUID).
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id,auth_user_id,plan_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (agentErr && (agentErr as any).code !== "PGRST116") {
    const m = typeof (agentErr as any).message === "string" ? String((agentErr as any).message).trim() : "";
    const code = (agentErr as any).code;
    throw new Error(m || (code ? `Agent lookup failed (${code})` : "Agent lookup failed"));
  }

  const agentIdRaw = (agent as any)?.id;
  if (agentIdRaw == null || agentIdRaw === "") {
    throw new Error(ERROR_DASHBOARD_NO_AGENT_ROW);
  }

  return {
    userId: user.id,
    agentId: String(agentIdRaw),
    planType: ((agent as any)?.plan_type ?? "free") as AgentRow["plan_type"],
    email: user.email ?? null,
  };
}

/**
 * Dual-auth agent context: resolve the user from the request (Bearer-aware via
 * getUserFromRequest, with a cookie-session fallback) and hand it to
 * getCurrentAgentContext. Lets a single route serve both the web (cookie) and
 * the mobile app (Authorization: Bearer <supabase-jwt>) without forking the
 * handler. Behaviour on web is unchanged: with no Bearer header,
 * getUserFromRequest falls back to the cookie session.
 */
export async function getAgentContextFromRequest(req: Request) {
  const user = await getUserFromRequest(req);
  return getCurrentAgentContext(user ?? undefined);
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

  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", start.toISOString());

  throwIfSupabaseError(error, "Could not load lead usage");

  const limit = getLeadLimit(planType);
  return { used: count ?? 0, limit, planType };
}

export async function getLeads(params?: {
  lead_status?: LeadStatus;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<CrmLeadRow[]> {
  const { agentId, planType } = await getCurrentAgentContext();
  const supabase = supabaseServerClient();

  let q = supabase
    .from("contacts")
    .select(
      "id,agent_id,name,email,phone,property_address,source,lead_status,notes,engagement_score,last_activity_at,nurture_score,rating,contact_frequency,contact_method,last_contacted_at,next_contact_at,search_location,search_radius,price_min,price_max,beds,baths,created_at,prediction_score,prediction_label,prediction_factors,prediction_computed_at"
    )
    .eq("agent_id", agentId)
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
  throwIfSupabaseError(error, "Could not load leads");
  const leads = (data as CrmLeadRow[]) ?? [];
  const leadIds = leads.map((l) => l.id).filter(Boolean);
  let scoreMap: Record<string, ReturnType<typeof unpackScoreRow>> = {};
  if (leadIds.length) {
    const { data: scoreRows } = await supabase
      .from("contact_scores")
      .select(CONTACT_SCORES_SELECT)
      .in("contact_id", leadIds as any)
      .order("computed_at", { ascending: false })
      .limit(5000);
    for (const row of scoreRows ?? []) {
      const key = String((row as any).contact_id ?? "");
      if (!key || scoreMap[key]) continue;
      scoreMap[key] = unpackScoreRow(row as Record<string, unknown>);
    }
  }

  const hydrated = leads.map((l) => {
    const s = scoreMap[String(l.id)];
    return {
      ...l,
      ai_lead_score: s ? s.score : null,
      ai_intent: s?.intent ?? null,
      ai_timeline: s?.timeline ?? null,
      ai_confidence: s?.confidence ?? null,
      ai_explanation: s?.explanation ?? [],
    } as CrmLeadRow;
  });

  return applyFreePlanLimit(hydrated, planType);
}

export async function getContacts(limit = 200): Promise<CrmContactRow[]> {
  const { agentId } = await getCurrentAgentContext();
  const scope = await getAgentScopeForAgent(String(agentId));

  // `contacts` has RLS enabled with no policies, so the session-bound client is
  // deny-all and returns 0 rows for everyone — the contact picker + bulk
  // call/SMS routes silently saw an empty list. Query via the service-role
  // client with explicit `.in(agent_id, scope)` as the tenant boundary, the
  // same pattern as /api/dashboard/leads and /api/dashboard/summary.
  //
  // `type` is the canonical column `lead_type` (the bare `type` column was
  // never in the consolidated contacts schema — selecting it 42703'd). Aliased
  // so CrmContactRow.type stays populated.
  const { data, error } = await supabaseServer
    .from("contacts")
    .select("id,agent_id,name,email,phone,address,type:lead_type,created_at")
    .in("agent_id", scope.agentIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error, "Could not load contacts");
  return (data as CrmContactRow[]) ?? [];
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const { agentId } = await getCurrentAgentContext();
  const supabase = supabaseServerClient();

  const { error } = await supabase
    .from("contacts")
    .update({ lead_status: status })
    .eq("id", id)
    .eq("agent_id", agentId);

  throwIfSupabaseError(error, "Could not update lead status");
}

export async function updateLeadNotes(id: string, notes: string) {
  const { agentId } = await getCurrentAgentContext();
  const supabase = supabaseServerClient();

  const { error } = await supabase
    .from("contacts")
    .update({ notes })
    .eq("id", id)
    .eq("agent_id", agentId);

  throwIfSupabaseError(error, "Could not update lead notes");
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
    .from("contacts")
    .update(updatePayload)
    .eq("id", id)
    .eq("agent_id", agentId);

  throwIfSupabaseError(error, "Could not update follow-up settings");
}


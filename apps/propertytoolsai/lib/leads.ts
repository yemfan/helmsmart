export type { LeadRecord, LeadRecordStatus } from "./leads/leadRecord";
export { buildLeadRecordFromUnlockBody } from "./leads/leadRecord";

export type CreateLeadInput = {
  name: string;
  email: string;
  phone?: string;
  /** e.g. "home_value" */
  source: string;
  /** buy | sell | refinance */
  intent?: string;
  property_address?: string;
  /** Optional tool key for traffic_source suffix */
  tool?: string;
  /** Saved to CRM as `property_value` when present */
  property_value?: number;
  /** 0–100 for scoring / CloseBoss routing */
  confidence_score?: number;
  /** 0–100 engagement / funnel depth for CloseBoss routing */
  engagement_score?: number;
  /** Extra structured context (stored in `notes` JSON on server) */
  metadata?: Record<string, unknown>;
  /** Funnel session id → `leads.session_id` + `tool_events` */
  session_id?: string;
  /** First-class address fields (CloseBoss schema) */
  full_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  estimate_low?: number;
  estimate_high?: number;
  /** e.g. high | medium | low */
  confidence?: string;
  likely_intent?: string;
  /** Home value funnel — optional */
  timeline?: string;
  buying_or_selling?: string;
};

export type ExpertLeadPayload = {
  name: string;
  email: string;
  phone?: string;
  subject_property: Record<string, unknown>;
  comparison_properties: Record<string, unknown>[];
  ai_recommendation: Record<string, unknown> | null;
  /** default "ai_comparison" */
  source?: string;
};

export type CreateLeadResult = {
  ok: boolean;
  leadId?: string;
  error?: string;
};

function apiBase(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3001"
  );
}

/**
 * Creates a CRM lead from a public tool funnel (server or client).
 * Prefer calling from the browser after modal submit; works in Route Handlers with absolute URL.
 */
export async function createLead(data: CreateLeadInput): Promise<CreateLeadResult> {
  const base = apiBase();
  const res = await fetch(`${base}/api/leads/tool-capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      phone: data.phone,
      source: data.source,
      intent: data.intent,
      property_address: data.property_address,
      tool: data.tool,
      property_value: data.property_value,
      confidence_score: data.confidence_score,
      engagement_score: data.engagement_score,
      metadata: data.metadata,
      session_id: data.session_id,
      full_address: data.full_address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      estimate_low: data.estimate_low,
      estimate_high: data.estimate_high,
      confidence: data.confidence,
      likely_intent: data.likely_intent,
      timeframe: data.timeline,
      buying_or_selling: data.buying_or_selling,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    leadId?: string | number;
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    return { ok: false, error: json.error ?? "Failed to create lead." };
  }
  const id =
    json.leadId != null && json.leadId !== ""
      ? String(json.leadId)
      : undefined;
  return { ok: true, leadId: id };
}

export type ExpertLeadResult = CreateLeadResult & {
  matched_agent_ids?: string[];
  primary_agent_id?: string | null;
};

/**
 * Expert CTA from AI Property Comparison — structured capture + agent matching.
 */
export async function createExpertLead(data: ExpertLeadPayload): Promise<ExpertLeadResult> {
  const base = apiBase();
  const res = await fetch(`${base}/api/leads/expert-capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      phone: data.phone,
      subject_property: data.subject_property,
      comparison_properties: data.comparison_properties,
      ai_recommendation: data.ai_recommendation,
      source: data.source ?? "ai_comparison",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    leadId?: string | number;
    error?: string;
    matched_agent_ids?: string[];
    primary_agent_id?: string | null;
  };
  if (!res.ok || json.ok === false) {
    return { ok: false, error: json.error ?? "Failed to create lead." };
  }
  const id =
    json.leadId != null && json.leadId !== ""
      ? String(json.leadId)
      : undefined;
  return {
    ok: true,
    leadId: id,
    matched_agent_ids: json.matched_agent_ids,
    primary_agent_id: json.primary_agent_id ?? null,
  };
}

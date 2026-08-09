import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Opportunity storage (migration 0015). Same service-role + explicit user_id
 * scoping as lib/campaigns.ts. Every read/write tolerates a pre-migration
 * database (MB migrations are user-applied): reads return [] and writes no-op
 * when the table doesn't exist yet.
 */

export type OpportunitySource = "trends" | "competitors" | "performance" | "seasonal";
export type OpportunityStatus = "open" | "accepted" | "dismissed" | "expired";
export type Level = "low" | "medium" | "high";

export type RecommendedAction = {
  type: "text" | "image" | "video";
  /** Prefill for the composer — what to tell the AI to make. */
  intent: string;
};

export type Opportunity = {
  id: string;
  source: OpportunitySource;
  title: string;
  description: string;
  reasoning: string;
  business_value: string | null;
  reach: Level | null;
  urgency: Level | null;
  confidence: number | null;
  score: number;
  recommended_action: RecommendedAction | null;
  status: OpportunityStatus;
  expires_at: string | null;
  created_at: string;
};

export type OpportunityInput = {
  source: OpportunitySource;
  title: string;
  description: string;
  reasoning: string;
  business_value?: string | null;
  reach?: Level | null;
  urgency?: Level | null;
  confidence?: number | null;
  recommended_action?: RecommendedAction | null;
};

/** True when the error is "table missing" — the DB predates migration 0015. */
function tableMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return m.includes("opportunities") && (m.includes("does not exist") || m.includes("schema cache"));
}

const LEVEL_W: Record<Level, number> = { low: 1, medium: 2, high: 3 };

/** Deterministic feed rank: confidence (0-50) + urgency (0-30) + reach (0-20). */
export function scoreOpportunity(o: OpportunityInput): number {
  const conf = Math.max(0, Math.min(1, o.confidence ?? 0.5)) * 50;
  const urg = (LEVEL_W[o.urgency ?? "medium"] / 3) * 30;
  const reach = (LEVEL_W[o.reach ?? "medium"] / 3) * 20;
  return Math.round(conf + urg + reach);
}

export async function listOpenOpportunities(userId: string, limit = 20): Promise<Opportunity[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Opportunity[]) ?? [];
}

/** Newest created_at across ALL states — used by the cron to run discovery at most daily. */
export async function latestOpportunityAt(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("opportunities")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null; // pre-migration or transient — treat as "never"
  return (data as { created_at: string } | null)?.created_at ?? null;
}

/**
 * Insert discovered opportunities, skipping any whose title matches an existing
 * OPEN one (case-insensitive) so repeated scans don't pile up duplicates.
 * Returns how many were actually inserted. No-ops pre-migration.
 */
export async function insertOpportunities(userId: string, inputs: OpportunityInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("opportunities")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "open");
  if (readErr) {
    if (tableMissing(readErr.message)) return 0;
    throw new Error(readErr.message);
  }
  const seen = new Set(((existing as { title: string }[]) ?? []).map((r) => r.title.trim().toLowerCase()));

  const fresh = inputs.filter((o) => !seen.has(o.title.trim().toLowerCase()));
  if (fresh.length === 0) return 0;

  const { error } = await admin.from("opportunities").insert(
    fresh.map((o) => ({
      user_id: userId,
      source: o.source,
      title: o.title,
      description: o.description,
      reasoning: o.reasoning,
      business_value: o.business_value ?? null,
      reach: o.reach ?? null,
      urgency: o.urgency ?? null,
      confidence: o.confidence ?? null,
      score: scoreOpportunity(o),
      recommended_action: o.recommended_action ?? null,
    })),
  );
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  return fresh.length;
}

export async function getOpportunity(userId: string, id: string): Promise<Opportunity | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as Opportunity) ?? null;
}

export async function setOpportunityStatus(userId: string, id: string, status: OpportunityStatus): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("opportunities").update({ status }).eq("user_id", userId).eq("id", id);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

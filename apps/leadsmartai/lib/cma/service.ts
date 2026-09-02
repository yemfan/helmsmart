import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

import { denormalize } from "./denormalize";
import { isSmartCmaFailure } from "./fetchSmartCma";
import { normalizeAddress } from "./normalizeAddress";
import { getCmaQuotaForUser, incrementCmaUsage } from "./quota";
import { isCredibleCmaValuation } from "./types";
import type { CmaSnapshot, CmaCompRow, CmaSubject, CmaValuation, CmaStrategy } from "./types";

/**
 * Server orchestrator for the CRM-side CMA workflow:
 *
 *   createCmaForAgent()  — fetch a fresh snapshot from the upstream
 *                           propertytoolsai engine and persist it as a
 *                           row owned by the agent.
 *   listCmasForAgent()    — list view with denormalized fields only
 *                           (agent dashboard).
 *   getCmaForAgent()      — full snapshot for the detail view.
 *   deleteCmaForAgent()   — remove a saved CMA.
 *
 * The upstream `/api/smart-cma` is the single source of truth for the
 * valuation engine. This module's job is just persistence + retrieval +
 * agent ownership scoping.
 */

export type CmaListRow = {
  id: string;
  agentId: string;
  contactId: string | null;
  subjectAddress: string;
  estimatedValue: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  confidenceScore: number | null;
  compCount: number;
  title: string | null;
  createdAt: string;
};

export type CmaFullRow = CmaListRow & {
  snapshot: CmaSnapshot;
  notes: string | null;
  updatedAt: string;
};

export type CreateCmaInput = {
  agentId: string;
  /** Auth user id — keys the daily CMA quota (cma_daily_usage). */
  userId: string;
  subjectAddress: string;
  contactId?: string | null;
  title?: string | null;
  notes?: string | null;
  /** Override property characteristics passed through to the upstream
   *  engine (when the agent has better data than the warehouse). */
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
};

export type CreateCmaResult =
  | { ok: true; cma: CmaFullRow }
  | { ok: false; status: number; error: string };

/** See note on isSmartCmaFailure — same `strict: false` narrowing issue. */
export function isCreateCmaFailure(
  r: CreateCmaResult,
): r is { ok: false; status: number; error: string } {
  return r.ok === false;
}

export async function createCmaForAgent(
  input: CreateCmaInput,
): Promise<CreateCmaResult> {
  const subjectAddress = input.subjectAddress.trim();
  if (!subjectAddress) {
    return { ok: false, status: 400, error: "Subject address is required." };
  }

  // The AI generation costs real tokens + web searches, so enforce the daily
  // quota up front (the propertytoolsai engine used to own this check).
  const quota = await getCmaQuotaForUser(input.userId);
  if (quota.reached) {
    return {
      ok: false,
      status: 429,
      error: `Daily CMA limit reached (${quota.limit}/day). Resets tomorrow.`,
    };
  }

  // Lazy-load the AI generation stack (Anthropic SDK + web search) so the
  // lightweight read paths (listCmasForAgent / getCmaForAgent / getPublicCma)
  // and the public /cma/[id] page don't pull it into their cold start.
  const { generateAiCma } = await import("./aiCma");
  const fetched = await generateAiCma({
    address: subjectAddress,
    beds: input.beds,
    baths: input.baths,
    sqft: input.sqft,
    yearBuilt: input.yearBuilt,
    condition: input.condition,
  });
  if (isSmartCmaFailure(fetched)) {
    return { ok: false, status: fetched.status || 502, error: fetched.error };
  }
  const snapshot = fetched.snapshot;

  // Defense in depth: never persist a non-credible ($0 / no-band) valuation,
  // regardless of how the snapshot was produced. The generator already guards
  // this, but a saved $0 CMA is one click from a "Send to seller" button — so
  // re-check at the only write path too.
  if (!isCredibleCmaValuation(snapshot.valuation)) {
    return {
      ok: false,
      status: 422,
      /*
       * "or enter the value manually" described a feature that does not exist:
       * there is no manual-value path on a CMA anywhere in the product, so the
       * one piece of advice offered to an agent whose report just failed was
       * for something they could not do. What actually helps is the thing the
       * generator itself asks for -- a full address -- plus an honest word
       * about the case no address will fix, which is a property with too few
       * recent public comps to value.
       */
      error:
        "We couldn't value this address confidently. Try the full address including city, state and ZIP — that resolves most failures. If it still fails, there probably aren't enough recent comparable sales published for this property yet; a nearby comparable address will usually work.",
    };
  }

  // Count the run only after a successful generation (don't burn quota on
  // failures). Best-effort — never fails the request.
  await incrementCmaUsage(input.userId);

  const denorm = denormalize(snapshot);

  const { data, error } = await supabaseAdmin
    .from("cma_reports")
    .insert({
      agent_id: input.agentId,
      contact_id: input.contactId ?? null,
      // Store the normalized agent input as the canonical display address
      // (the route normalized it) rather than the model's free-text echo.
      subject_address: subjectAddress || snapshot.subject.address,
      subject_json: snapshot.subject,
      comps_json: snapshot.comps,
      valuation_json: snapshot.valuation,
      strategies_json: snapshot.strategies,
      // Full snapshot incl. AI sources/summary/disclaimer — the per-field
      // columns above stay populated for the denormalized list view.
      snapshot_json: snapshot,
      estimated_value: denorm.estimatedValue,
      low_estimate: denorm.lowEstimate,
      high_estimate: denorm.highEstimate,
      confidence_score: denorm.confidenceScore,
      comp_count: denorm.compCount,
      title: input.title ?? null,
      notes: input.notes ?? null,
    } as never)
    .select(
      "id, agent_id, contact_id, subject_address, subject_json, comps_json, valuation_json, strategies_json, snapshot_json, estimated_value, low_estimate, high_estimate, confidence_score, comp_count, title, notes, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: error?.message ?? "Failed to save CMA report.",
    };
  }

  return { ok: true, cma: rowToFull(data as RawCmaRow) };
}

export type ReusableCma = {
  cmaId: string;
  createdAt: string;
  snapshot: CmaSnapshot;
};

/**
 * Find the agent's most recent CMA for an address, for reuse by the
 * Seller Presentation (so it doesn't re-run a paid web search when a
 * fresh CMA already exists). Matches on the normalized address and a
 * recency window; returns null when none is recent enough.
 */
export async function findRecentCmaSnapshotByAddress(
  agentId: string,
  address: string,
  maxAgeDays = 30,
): Promise<ReusableCma | null> {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const sinceIso = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("cma_reports")
    .select(
      "id, agent_id, contact_id, subject_address, subject_json, comps_json, valuation_json, strategies_json, snapshot_json, estimated_value, low_estimate, high_estimate, confidence_score, comp_count, title, notes, created_at, updated_at",
    )
    .eq("agent_id", agentId)
    .eq("subject_address", normalized)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn("[cma.findRecentCmaSnapshotByAddress] failed:", error.message);
    return null;
  }
  const full = rowToFull(data as RawCmaRow);
  return { cmaId: full.id, createdAt: full.createdAt, snapshot: full.snapshot };
}

export async function listCmasForAgent(
  agentId: string,
  opts: { limit?: number } = {},
): Promise<CmaListRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const { data, error } = await supabaseAdmin
    .from("cma_reports")
    .select(
      "id, agent_id, contact_id, subject_address, estimated_value, low_estimate, high_estimate, confidence_score, comp_count, title, created_at",
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[cma.listCmasForAgent] failed:", error.message);
    return [];
  }
  return ((data ?? []) as RawCmaListRow[]).map(rowToList);
}

export async function getCmaForAgent(
  agentId: string,
  cmaId: string,
): Promise<CmaFullRow | null> {
  const { data, error } = await supabaseAdmin
    .from("cma_reports")
    .select(
      "id, agent_id, contact_id, subject_address, subject_json, comps_json, valuation_json, strategies_json, snapshot_json, estimated_value, low_estimate, high_estimate, confidence_score, comp_count, title, notes, created_at, updated_at",
    )
    .eq("id", cmaId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) {
    console.warn("[cma.getCmaForAgent] failed:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToFull(data as RawCmaRow);
}

/**
 * Public read by id (no agent scope) for the shareable /cma/[id] page.
 * Share-by-link, same posture as the Deep Report public page.
 */
export async function getPublicCma(cmaId: string): Promise<CmaFullRow | null> {
  const { data, error } = await supabaseAdmin
    .from("cma_reports")
    .select(
      "id, agent_id, contact_id, subject_address, subject_json, comps_json, valuation_json, strategies_json, snapshot_json, estimated_value, low_estimate, high_estimate, confidence_score, comp_count, title, notes, created_at, updated_at",
    )
    .eq("id", cmaId)
    .maybeSingle();
  if (error) {
    console.warn("[cma.getPublicCma] failed:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToFull(data as RawCmaRow);
}

export async function deleteCmaForAgent(
  agentId: string,
  cmaId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("cma_reports")
    .delete()
    .eq("id", cmaId)
    .eq("agent_id", agentId);
  if (error) {
    console.warn("[cma.deleteCmaForAgent] failed:", error.message);
    return false;
  }
  return true;
}

// ── internal mappers + denorm ────────────────────────────────────

type RawCmaListRow = {
  id: string;
  agent_id: string | number;
  contact_id: string | null;
  subject_address: string;
  estimated_value: number | string | null;
  low_estimate: number | string | null;
  high_estimate: number | string | null;
  confidence_score: number | null;
  comp_count: number | null;
  title: string | null;
  created_at: string;
};

type RawCmaRow = RawCmaListRow & {
  subject_json: unknown;
  comps_json: unknown;
  valuation_json: unknown;
  strategies_json: unknown;
  snapshot_json: unknown;
  notes: string | null;
  updated_at: string;
};

function rowToList(r: RawCmaListRow): CmaListRow {
  return {
    id: r.id,
    agentId: String(r.agent_id),
    contactId: r.contact_id,
    subjectAddress: r.subject_address,
    estimatedValue: numericOrNull(r.estimated_value),
    lowEstimate: numericOrNull(r.low_estimate),
    highEstimate: numericOrNull(r.high_estimate),
    confidenceScore: r.confidence_score,
    compCount: r.comp_count ?? 0,
    title: r.title,
    createdAt: r.created_at,
  };
}

function rowToFull(r: RawCmaRow): CmaFullRow {
  // Newer rows store the complete snapshot (incl. AI sources/summary/
  // disclaimer) in snapshot_json; fall back to the per-field columns for
  // rows written before that column existed.
  if (r.snapshot_json && typeof r.snapshot_json === "object") {
    return {
      ...rowToList(r),
      snapshot: r.snapshot_json as CmaSnapshot,
      notes: r.notes,
      updatedAt: r.updated_at,
    };
  }
  const snapshot: CmaSnapshot = {
    subject: (r.subject_json ?? {
      address: r.subject_address,
      beds: 0,
      baths: 0,
      sqft: 0,
      propertyType: null,
      yearBuilt: 0,
      condition: null,
    }) as CmaSubject,
    comps: (Array.isArray(r.comps_json) ? r.comps_json : []) as CmaCompRow[],
    valuation: (r.valuation_json ?? {
      estimatedValue: 0,
      low: 0,
      high: 0,
      avgPricePerSqft: 0,
    }) as CmaValuation,
    strategies: (r.strategies_json ?? null) as CmaStrategy | null,
  };
  return {
    ...rowToList(r),
    snapshot,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

function numericOrNull(v: number | string | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

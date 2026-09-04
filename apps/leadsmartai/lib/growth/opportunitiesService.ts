import "server-only";

import { isAnthropicConfigured } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gatherAgentGrowthSnapshot } from "./gatherSnapshot";
import { generateOpportunities } from "./generateOpportunities";
import type { GrowthOpportunity } from "./opportunityTypes";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

/**
 * Orchestration layer for the Growth & Opportunities feature.
 *
 *   * Fresh read — return cached if within TTL; otherwise gather +
 *     regenerate + persist. This is the default path.
 *   * Force regenerate — "Refresh" button in the UI bypasses the cache.
 *
 * Cache TTL is 1 hour. Underlying data changes hourly at most (new
 * contacts, moved leads), and Claude runs cost money — 1h is a fine
 * floor on the generation rate.
 *
 * If Anthropic isn't configured (no API key), returns an empty list +
 * an `aiConfigured: false` flag so the UI can render a "connect
 * Claude" hint instead of silently failing.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;

export type OpportunitiesResult = {
  opportunities: GrowthOpportunity[];
  generatedAtIso: string;
  fromCache: boolean;
  aiConfigured: boolean;
};

export async function getOpportunities(
  agentId: string,
  opts?: { forceRefresh?: boolean },
): Promise<OpportunitiesResult> {
  if (!isAnthropicConfigured()) {
    return {
      opportunities: [],
      generatedAtIso: new Date().toISOString(),
      fromCache: false,
      aiConfigured: false,
    };
  }

  if (!opts?.forceRefresh) {
    const cached = await readCache(agentId);
    if (cached) {
      return {
        opportunities: cached.opportunities,
        generatedAtIso: cached.generatedAtIso,
        fromCache: true,
        aiConfigured: true,
      };
    }
  }

  const snapshot = await gatherAgentGrowthSnapshot(agentId);
  const opportunities = await generateOpportunities(snapshot, await agentUiLocale(agentId));
  const generatedAtIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + CACHE_TTL_MS).toISOString();

  await writeCache(agentId, { opportunities, generatedAtIso }, expiresAtIso);

  return {
    opportunities,
    generatedAtIso,
    fromCache: false,
    aiConfigured: true,
  };
}

type CachePayload = {
  opportunities: GrowthOpportunity[];
  generatedAtIso: string;
};

async function readCache(agentId: string): Promise<CachePayload | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_opportunities_cache")
      .select("payload, generated_at, expires_at")
      .eq("agent_id", agentId)
      .maybeSingle();
    // Missing-table + permissions + RLS errors all surface here. Treat
    // any failure as a cache miss — never let a cache issue break the
    // primary flow. The caller will regenerate + try writing again.
    if (error) {
      console.warn(
        "[growth.readCache] skipping cache:",
        (error as { message?: string }).message ?? error,
      );
      return null;
    }
    if (!data) return null;
    const row = data as {
      payload: CachePayload;
      generated_at: string;
      expires_at: string;
    };
    // Paranoid check — don't trust the expires_at clock; if expired, treat as miss.
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    return {
      opportunities: Array.isArray(row.payload?.opportunities)
        ? row.payload.opportunities
        : [],
      generatedAtIso: row.payload?.generatedAtIso ?? row.generated_at,
    };
  } catch (err) {
    console.warn(
      "[growth.readCache] threw:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function writeCache(
  agentId: string,
  payload: CachePayload,
  expiresAtIso: string,
): Promise<void> {
  try {
    await supabaseAdmin.from("growth_opportunities_cache").upsert(
      {
        agent_id: agentId,
        payload,
        generated_at: payload.generatedAtIso,
        expires_at: expiresAtIso,
      },
      { onConflict: "agent_id" },
    );
  } catch (err) {
    // Cache-write failures shouldn't propagate. The UI still gets the
    // fresh opportunities; next page load will regenerate.
    console.error(
      "[growth.opportunitiesService] cache write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

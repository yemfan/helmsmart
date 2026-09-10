/**
 * Payload helpers for CloseBoss — CRM + marketplace routing.
 */
import type { UserIntent } from "@/lib/homeValue/types";

export type CloseBossHomeValueMeta = {
  v: 2;
  tool: string;
  /**
   * Persisted key, not a brand reference. This object is JSON-stringified
   * into the lead's notes column, and rows written before the CloseBoss
   * rename already carry it. Renaming it here would split old and new
   * records, so it stays until a backfill migrates both.
   */
  leadsmart: {
    routing: string;
    ready_for_intelligence: boolean;
    likely_intent: UserIntent;
    session_id?: string;
  };
  estimate_low?: number;
  estimate_high?: number;
  confidence_level?: string;
  confidence_score?: number;
  engagement_score?: number;
  property_value?: number;
  comps_priced?: number;
  market_source?: string;
};

export function buildCloseBossHomeValueNotes(input: {
  tool: string;
  likelyIntent: UserIntent;
  sessionId?: string | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  confidenceLevel?: string | null;
  confidenceScore?: number | null;
  engagementScore?: number | null;
  propertyValue?: number | null;
  compsPriced?: number | null;
  marketSource?: string | null;
}): string {
  const meta: CloseBossHomeValueMeta = {
    v: 2,
    tool: input.tool,
    leadsmart: {
      routing: "propertytools_home_value_unlock",
      ready_for_intelligence: true,
      likely_intent: input.likelyIntent,
      ...(input.sessionId ? { session_id: input.sessionId } : {}),
    },
    estimate_low: input.estimateLow ?? undefined,
    estimate_high: input.estimateHigh ?? undefined,
    confidence_level: input.confidenceLevel ?? undefined,
    confidence_score: input.confidenceScore ?? undefined,
    engagement_score: input.engagementScore ?? undefined,
    property_value: input.propertyValue ?? undefined,
    comps_priced: input.compsPriced ?? undefined,
    market_source: input.marketSource ?? undefined,
  };
  return JSON.stringify(meta);
}

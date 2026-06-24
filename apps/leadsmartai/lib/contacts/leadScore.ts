import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadRating } from "@/lib/contacts/recomputeLeadRating";

/**
 * Read-only "score view" of a contact, derived from the composite lead
 * rating (see recomputeLeadRating). This is the replacement for the retired
 * lib/leadScoring.ts `scoreLead()` — same shape so existing API/feature
 * consumers keep working, but sourced from the single composite engine
 * (engagement_score + hot/warm/cold + the latest contact_scores factors)
 * instead of the old parallel model that read a nonexistent column.
 *
 * Does NOT recompute — callers that want a fresh score should call
 * recomputeLeadRating (or logEngagementEvent) first, then read this.
 */
export type LeadScoreView = {
  lead_score: number;
  rating: LeadRating;
  intent: "low" | "medium" | "high";
  intent_level: "low" | "medium" | "high";
  timeline: "0-3 months" | "3-6 months" | "6+ months";
  confidence: number;
  explanation: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildExplanation(factors: Record<string, unknown>, score: number): string[] {
  const out: string[] = [];
  const call = factors.call;
  if (typeof call === "string") out.push(`Last AI call rated ${call}`);
  if (factors.email_reply) out.push("Replied to an email");
  if (factors.sms_reply) out.push("Replied by text");
  if (factors.open_house) out.push("Attended an open house");
  if (score >= 40) out.push("Active on site recently");
  if (factors.opted_out) out.push("Opted out of messaging");
  if (out.length === 0) out.push("No recent engagement");
  return out;
}

export async function getLeadScoreView(contactId: string): Promise<LeadScoreView> {
  const { data: c } = await supabaseAdmin
    .from("contacts")
    .select("engagement_score, rating")
    .eq("id", contactId)
    .maybeSingle();
  const lead_score = Number((c as { engagement_score?: number | null } | null)?.engagement_score ?? 0);
  const rating = ((c as { rating?: string | null } | null)?.rating as LeadRating | null) ?? "cold";

  const { data: sc } = await supabaseAdmin
    .from("contact_scores")
    .select("factors")
    .eq("contact_id", contactId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const factors = ((sc as { factors?: Record<string, unknown> } | null)?.factors ?? {}) as Record<
    string,
    unknown
  >;

  const intent: LeadScoreView["intent"] =
    rating === "hot" ? "high" : rating === "warm" ? "medium" : "low";
  const timeline: LeadScoreView["timeline"] =
    rating === "hot" ? "0-3 months" : rating === "warm" ? "3-6 months" : "6+ months";

  return {
    lead_score,
    rating,
    intent,
    intent_level: intent,
    timeline,
    confidence: Number(clamp(lead_score / 100, 0.2, 1).toFixed(4)),
    explanation: buildExplanation(factors, lead_score),
  };
}

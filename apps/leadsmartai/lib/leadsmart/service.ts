import { supabaseServer } from "@/lib/supabaseServer";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";
import { getLeadScoreView } from "@/lib/contacts/leadScore";
import { generateLeadSmartNarrative } from "@/lib/leadsmart/aiClient";
import { getLeadSmartConfig } from "@/lib/leadsmart/config";
import { leadsmartLog } from "@/lib/leadsmart/logger";
import type { LeadSmartIntelligence, LeadSmartRunRow } from "@/lib/leadsmart/types";

async function persistRun(leadId: string, row: LeadSmartRunRow) {
  await supabaseServer.from("leadsmart_runs").insert({
    contact_id: leadId as any,
    status: row.status,
    model: row.model ?? null,
    score: row.score ?? null,
    intent: row.intent ?? null,
    timeline: row.timeline ?? null,
    confidence: row.confidence ?? null,
    explanation: row.explanation ?? [],
    payload: row.payload ?? {},
    latency_ms: row.latency_ms ?? null,
    error: row.error ?? null,
  } as any);
}

export async function buildLeadSmartIntelligence(leadId: string): Promise<LeadSmartIntelligence> {
  const started = Date.now();
  const cfg = getLeadSmartConfig();
  try {
    // Refresh the composite rating, then read the derived score view.
    await recomputeLeadRating(leadId);
    const score = await getLeadScoreView(leadId);
    const ai = await generateLeadSmartNarrative({
      leadScore: score.lead_score,
      intent: score.intent,
      timeline: score.timeline,
      confidence: score.confidence,
      explanation: score.explanation,
    });
    const latency = Date.now() - started;
    const out: LeadSmartIntelligence = {
      contact_id: String(leadId),
      lead_score: score.lead_score,
      intent: score.intent,
      timeline: score.timeline,
      confidence: score.confidence,
      explanation: score.explanation,
      ai_summary: String((ai as any).ai_summary ?? ""),
      ai_next_best_action: String((ai as any).ai_next_best_action ?? ""),
      model: cfg.openaiModel,
      latency_ms: latency,
    };
    await persistRun(leadId, {
      status: "success",
      model: cfg.openaiModel,
      score: out.lead_score,
      intent: out.intent,
      timeline: out.timeline,
      confidence: out.confidence,
      explanation: out.explanation,
      payload: {
        ai_summary: out.ai_summary,
        ai_next_best_action: out.ai_next_best_action,
      },
      latency_ms: latency,
    });
    return out;
  } catch (e: any) {
    const latency = Date.now() - started;
    await persistRun(leadId, {
      status: "error",
      model: cfg.openaiModel,
      latency_ms: latency,
      error: String(e?.message ?? "Unknown error"),
    });
    leadsmartLog("error", "buildLeadSmartIntelligence failed", {
      contact_id: leadId,
      error: String(e?.message ?? "Unknown error"),
    });
    throw e;
  }
}

export async function refreshLeadSmartBatch() {
  const cfg = getLeadSmartConfig();
  const { data: leads, error } = await supabaseServer
    .from("contacts")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(cfg.refreshBatchSize);
  if (error) throw error;
  let processed = 0;
  let failed = 0;
  for (const row of leads ?? []) {
    processed += 1;
    try {
      await buildLeadSmartIntelligence(String((row as any).id));
    } catch {
      failed += 1;
    }
  }
  return { processed, failed, succeeded: processed - failed };
}

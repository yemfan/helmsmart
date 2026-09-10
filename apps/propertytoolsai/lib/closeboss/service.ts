import { supabaseServer } from "@/lib/supabaseServer";
import { scoreLead } from "@/lib/leadScoring";
import { generateCloseBossNarrative } from "@/lib/closeboss/aiClient";
import { getCloseBossConfig } from "@/lib/closeboss/config";
import { closebossLog } from "@/lib/closeboss/logger";
import type { CloseBossIntelligence, CloseBossRunRow } from "@/lib/closeboss/types";

async function persistRun(leadId: string, row: CloseBossRunRow) {
  await supabaseServer.from("leadsmart_runs").insert({
    lead_id: leadId as any,
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

export async function buildCloseBossIntelligence(leadId: string): Promise<CloseBossIntelligence> {
  const started = Date.now();
  const cfg = getCloseBossConfig();
  try {
    const score = await scoreLead(leadId, false);
    const ai = await generateCloseBossNarrative({
      leadScore: score.lead_score,
      intent: score.intent,
      timeline: score.timeline,
      confidence: score.confidence,
      explanation: score.explanation,
    });
    const latency = Date.now() - started;
    const out: CloseBossIntelligence = {
      lead_id: String(leadId),
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
    closebossLog("error", "buildCloseBossIntelligence failed", {
      lead_id: leadId,
      error: String(e?.message ?? "Unknown error"),
    });
    throw e;
  }
}

export async function refreshCloseBossBatch() {
  const cfg = getCloseBossConfig();
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(cfg.refreshBatchSize);
  if (error) throw error;
  let processed = 0;
  let failed = 0;
  for (const row of leads ?? []) {
    processed += 1;
    try {
      await buildCloseBossIntelligence(String((row as any).id));
    } catch {
      failed += 1;
    }
  }
  return { processed, failed, succeeded: processed - failed };
}

import { NextRequest, NextResponse, after } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processInstructionById } from "@/lib/realtyboss/instructions";
import { isBossV2Enabled, startBossRun, continueBossRun } from "@/lib/boss/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Immediate processing runs after the response. Action runs (AI CMA / seller
// presentation) do live web search across tool rounds — give them room.
export const maxDuration = 300;

/**
 * The Boss Assistant instruction channel.
 *
 *   GET  ?limit=5  → latest instructions, each with its routed tasks
 *   POST { content } → queue a new instruction (status pending; the
 *                      5-minute cron parses + routes it)
 */
export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 5);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 5, 1), 20);

    const { data: instructions, error } = await supabaseAdmin
      .from("boss_instructions")
      .select("id, content, status, error, clarification, processed_at, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const ids = (instructions ?? []).map((i) => (i as { id: string }).id);
    let tasks: unknown[] = [];
    if (ids.length > 0) {
      const { data: taskRows, error: taskErr } = await supabaseAdmin
        .from("boss_instruction_tasks")
        .select(
          "id, instruction_id, title, details, assigned_to, status, draft_channel, draft_subject, draft_body, execution_note, action_type, follow_up_question, artifact_type, artifact_url, created_at",
        )
        .in("instruction_id", ids)
        .order("created_at", { ascending: true });
      if (taskErr) throw new Error(taskErr.message);
      tasks = taskRows ?? [];
    }

    return NextResponse.json({ ok: true, instructions: instructions ?? [], tasks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json(
      { ok: false, error: msg, instructions: [], tasks: [] },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 4000) : "";
    if (!content) {
      return NextResponse.json(
        { ok: false, error: "Write an instruction first." },
        { status: 400 },
      );
    }
    const { data, error } = await supabaseAdmin
      .from("boss_instructions")
      .insert({ agent_id: agentId, content })
      .select("id, content, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Process right away — no waiting for the 5-minute cron. Runs
    // after the response so Send returns instantly; the card polls
    // for the routed task list. The cron stays as the safety net.
    //
    // Boss v2 (HANDOFF_BOSS_V2 PR-3): when the agent is flagged in, a live
    // agent run replaces cron-style parse-and-route. startBossRun marks the
    // instruction `processing`, so the legacy cron won't double-handle it.
    const instructionId = (data as { id: string }).id;
    const v2 = await isBossV2Enabled(String(agentId));
    let runId: string | null = null;
    if (v2) {
      const started = await startBossRun({
        agentId: String(agentId),
        objective: content,
        trigger: "command",
        instructionId,
      });
      if ("runId" in started) runId = started.runId;
    }
    after(async () => {
      try {
        if (runId) {
          await continueBossRun(runId);
        } else {
          await processInstructionById(instructionId);
        }
      } catch (e) {
        console.error("[boss-instructions] immediate processing failed:", e);
      }
    });

    return NextResponse.json({ ok: true, instruction: data, run_id: runId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

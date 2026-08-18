import { NextRequest, NextResponse, after } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processInstructionById } from "@/lib/closeboss/instructions";
import { isBossV2Enabled, startBossRun, continueBossRun } from "@/lib/boss/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Immediate processing runs after the response. Action runs (AI CMA / seller
// presentation) do live web search across tool rounds — give them room.
export const maxDuration = 300;

/**
 * The Boss Assistant instruction channel.
 *
 *   GET  ?limit=5              → latest instructions, each with its routed tasks
 *   GET  ?limit=5&before=<iso> → the next page of OLDER instructions (created
 *                                strictly before the cursor) — powers the
 *                                "Load earlier conversations" pager so the
 *                                thread stays bounded by date instead of piling
 *                                up. `hasMore` tells the client whether another
 *                                older page exists.
 *   POST { content }           → queue a new instruction (status pending; the
 *                                5-minute cron parses + routes it)
 */
export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 5);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 5, 1), 20);
    // Keyset pagination cursor: fetch the page of instructions created strictly
    // before this ISO timestamp (the oldest one the client is already showing).
    const before = req.nextUrl.searchParams.get("before");

    let query = supabaseAdmin
      .from("boss_instructions")
      .select("id, content, status, error, clarification, processed_at, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before && !Number.isNaN(Date.parse(before))) {
      query = query.lt("created_at", before);
    }
    const { data: instructions, error } = await query;
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

    // A full page implies there may be another older page behind it.
    const hasMore = (instructions?.length ?? 0) >= limit;
    return NextResponse.json({ ok: true, instructions: instructions ?? [], tasks, hasMore });
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
    const body = (await req.json().catch(() => ({}))) as {
      content?: unknown;
      attachment?: { path?: unknown; name?: unknown; mime?: unknown; kind?: unknown };
    };
    let content = typeof body.content === "string" ? body.content.trim().slice(0, 4000) : "";
    if (!content) {
      return NextResponse.json(
        { ok: false, error: "Write an instruction first." },
        { status: 400 },
      );
    }

    // A file the user attached in the command bar — surface it to Max as a
    // reference in the instruction (public URL for images so a social post can
    // use it; storage path for docs so the import tool can read it back).
    const att = body.attachment;
    const attPath = typeof att?.path === "string" ? att.path : "";
    if (attPath) {
      const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
      const name = String(att?.name ?? "file").slice(0, 200);
      const ref =
        att?.kind === "ad_photo" && base
          ? `(Attached image "${name}": ${base}/storage/v1/object/public/social-images/${attPath})`
          : `(Attached file "${name}" [${String(att?.mime ?? "unknown")}], stored at lead-media/${attPath})`;
      content = `${content}\n\n${ref}`.slice(0, 4000);
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
      if ("runId" in started) {
        runId = started.runId;
      } else if (started.code) {
        // Quota/entitlement gate — surface the standard 402 the AI-action
        // UI already understands; do NOT fall back to the free legacy path.
        await supabaseAdmin
          .from("boss_instructions")
          .update({ status: "failed", error: started.error, updated_at: new Date().toISOString() })
          .eq("id", instructionId);
        return NextResponse.json(
          { ok: false, error: started.error, code: started.code },
          { status: 402 },
        );
      }
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

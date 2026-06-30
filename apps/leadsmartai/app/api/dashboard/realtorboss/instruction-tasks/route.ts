import { NextRequest, NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendDraftedBossTask } from "@/lib/realtorboss/sendTaskDraft";
import { executeBossAction } from "@/lib/realtorboss/actions/execute";
import { BOSS_ACTIONS, isBossActionType, missingParams } from "@/lib/realtorboss/actions/registry";

export const runtime = "nodejs";
// An "answer" can kick off a real action (AI CMA / seller presentation) that
// does live web search across tool rounds — give it room.
export const maxDuration = 300;

/**
 * PATCH /api/dashboard/realtorboss/instruction-tasks
 *   { id, action: "approve" | "dismiss" | "answer", answer? }
 *
 * approve — send the assistant's draft (SMS via Twilio, email via Resend) and
 * mark it sent. dismiss — drop it. answer — supply a missing required param
 * (the Boss's follow-up question), then run the action. The approval moment is
 * THE control point: nothing the Boss routes to the team sends without it.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      action?: unknown;
      answer?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";
    const action =
      body.action === "approve" || body.action === "dismiss" || body.action === "answer"
        ? body.action
        : null;
    if (!id || !action) {
      return NextResponse.json({ ok: false, error: "Missing id or action." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("boss_instruction_tasks")
      .select(
        "id, title, assigned_to, status, matched_contact_id, draft_channel, draft_subject, draft_body, execution_note, action_type, params_json",
      )
      .eq("id", id)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const task = data as {
      id: string;
      title: string;
      assigned_to: string;
      status: string;
      matched_contact_id: string | null;
      draft_channel: "sms" | "email" | null;
      draft_subject: string | null;
      draft_body: string | null;
      execution_note: string | null;
      action_type: string | null;
      params_json: Record<string, string> | null;
    } | null;
    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    }

    // answer — the Realtor supplied a missing required param. Merge it into the
    // first still-missing param, then run the action.
    if (action === "answer") {
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";
      if (!answer) {
        return NextResponse.json({ ok: false, error: "Type an answer first." }, { status: 400 });
      }
      if (task.status !== "needs_input" || !isBossActionType(task.action_type)) {
        return NextResponse.json(
          { ok: false, error: "This task isn't waiting on an answer." },
          { status: 400 },
        );
      }
      const type = task.action_type;
      const params: Record<string, string> = { ...(task.params_json ?? {}) };
      const stillMissing = missingParams(type, params);
      const fillKey = stillMissing[0]?.key ?? BOSS_ACTIONS[type].requiredParams[0]?.key;
      if (fillKey) params[fillKey] = answer.slice(0, 300);
      const outcome = await executeBossAction({ agentId, taskId: id, type, params });
      return NextResponse.json({ ok: true, status: outcome });
    }

    if (action === "dismiss") {
      await supabaseAdmin
        .from("boss_instruction_tasks")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ ok: true, status: "dismissed" });
    }

    // approve — only drafts can send.
    if (task.status !== "awaiting_approval") {
      return NextResponse.json(
        { ok: false, error: "This task has no draft awaiting approval." },
        { status: 400 },
      );
    }
    const sent = await sendDraftedBossTask(agentId, task, { auto: false });
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: "sent" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

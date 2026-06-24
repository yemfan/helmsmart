import { NextRequest, NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAssistantActivity } from "@/lib/realtorboss/activities";
import type { AssistantType } from "@/lib/realtorboss/team";
import { sendSMS } from "@/lib/twilioSms";
import { sendEmail } from "@/lib/email";
import { toE164 } from "@/lib/missed-call/service";
import { executeBossAction } from "@/lib/realtorboss/actions/execute";
import { BOSS_ACTIONS, isBossActionType, missingParams } from "@/lib/realtorboss/actions/registry";

export const runtime = "nodejs";
// An "answer" can kick off a real action (e.g. CMA web-search generation).
export const maxDuration = 120;

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
    const { agentId } = await getCurrentAgentContext();
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
    if (task.status !== "awaiting_approval" || !task.draft_body || !task.draft_channel) {
      return NextResponse.json(
        { ok: false, error: "This task has no draft awaiting approval." },
        { status: 400 },
      );
    }

    let sentTo: string | null = null;
    if (task.draft_channel === "sms") {
      if (!task.matched_contact_id) {
        return NextResponse.json({ ok: false, error: "No contact on this draft." }, { status: 400 });
      }
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("phone, phone_number, name")
        .eq("id", task.matched_contact_id)
        .maybeSingle();
      const row = c as { phone: string | null; phone_number: string | null; name: string | null } | null;
      const e164 = toE164(row?.phone_number ?? row?.phone ?? null);
      if (!e164) {
        return NextResponse.json(
          { ok: false, error: "The contact has no valid US phone number." },
          { status: 400 },
        );
      }
      await sendSMS(e164, task.draft_body, task.matched_contact_id);
      sentTo = row?.name ?? e164;
    } else {
      // Email — recipient from the matched contact, or the execution
      // note ("to:<email>|…") for invoice chasers.
      let to: string | null = null;
      let toName: string | null = null;
      if (task.matched_contact_id) {
        const { data: c } = await supabaseAdmin
          .from("contacts")
          .select("email, name")
          .eq("id", task.matched_contact_id)
          .maybeSingle();
        to = (c as { email: string | null } | null)?.email ?? null;
        toName = (c as { name: string | null } | null)?.name ?? null;
      }
      if (!to && task.execution_note?.startsWith("to:")) {
        to = task.execution_note.slice(3).split("|")[0].trim() || null;
      }
      if (!to) {
        return NextResponse.json(
          { ok: false, error: "No email address on this draft." },
          { status: 400 },
        );
      }
      await sendEmail({
        to,
        subject: task.draft_subject ?? task.title,
        text: task.draft_body,
      });
      sentTo = toName ?? to;
    }

    await supabaseAdmin
      .from("boss_instruction_tasks")
      .update({
        status: "sent",
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    void logAssistantActivity({
      agentId,
      assistantType: task.assigned_to as AssistantType,
      activityType: "boss_task_sent",
      summary: `Sent the ${task.draft_channel === "sms" ? "text" : "email"} to ${sentTo} — approved by you`,
      outcome: task.draft_body.length > 160 ? `${task.draft_body.slice(0, 157)}…` : task.draft_body,
      requiresAttention: false,
      relatedEntityType: task.matched_contact_id ? "contact" : null,
      relatedEntityId: task.matched_contact_id,
    });

    return NextResponse.json({ ok: true, status: "sent" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

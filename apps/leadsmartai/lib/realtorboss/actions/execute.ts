import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  BOSS_ACTIONS,
  followUpQuestion,
  missingParams,
  type BossActionType,
} from "./registry";

/**
 * Runs a registry action for a Boss task and writes the result onto the
 * boss_instruction_tasks row. Shared by the initial parse-time execution and
 * the clarify round-trip (after the Realtor answers a follow-up question).
 *
 *   needs_input → required params missing; we store what we have + the
 *                 follow-up question for the Boss card to ask.
 *   completed   → the action ran and produced an artifact (link stored).
 *   assigned    → couldn't complete (e.g. quota, generation error); the task
 *                 stays visible on the assistant's desk with a note.
 */
export type BossExecOutcome = "needs_input" | "completed" | "assigned";

export async function executeBossAction(args: {
  agentId: string;
  taskId: string;
  type: BossActionType;
  params: Record<string, string>;
}): Promise<BossExecOutcome> {
  const { agentId, taskId, type, params } = args;
  const now = new Date().toISOString();

  if (missingParams(type, params).length > 0) {
    await supabaseAdmin
      .from("boss_instruction_tasks")
      .update({
        status: "needs_input",
        action_type: type,
        params_json: params,
        follow_up_question: followUpQuestion(type, params),
        updated_at: now,
      })
      .eq("id", taskId);
    return "needs_input";
  }

  try {
    const result = await BOSS_ACTIONS[type].run({ agentId, params });
    if (result.status === "completed") {
      await supabaseAdmin
        .from("boss_instruction_tasks")
        .update({
          status: "completed",
          action_type: type,
          params_json: params,
          follow_up_question: null,
          artifact_type: result.artifactType,
          artifact_url: result.artifactUrl,
          execution_note: result.note,
          executed_at: now,
          updated_at: now,
        })
        .eq("id", taskId);
      return "completed";
    }
    await supabaseAdmin
      .from("boss_instruction_tasks")
      .update({
        status: "assigned",
        action_type: type,
        params_json: params,
        follow_up_question: null,
        execution_note: result.note,
        updated_at: now,
      })
      .eq("id", taskId);
    return "assigned";
  } catch (e) {
    console.error(`[boss-execution] action ${type} failed for task ${taskId}:`, e);
    await supabaseAdmin
      .from("boss_instruction_tasks")
      .update({
        status: "assigned",
        action_type: type,
        params_json: params,
        execution_note: "Couldn't complete automatically — left on the assistant's desk.",
        updated_at: now,
      })
      .eq("id", taskId);
    return "assigned";
  }
}

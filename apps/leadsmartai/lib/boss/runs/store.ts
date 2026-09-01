import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ToolOutcome } from "../tools/types";

/**
 * Durable state for the Boss v2 agent loop. The engine only touches runs
 * through this interface so tests can drive it fully in memory.
 */

export type BossRunStatus =
  | "planning"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "budget_exceeded"
  | "cancelled";

export type BossRunRow = {
  id: string;
  agent_id: string;
  trigger: "command" | "overnight" | "retry";
  instruction_id: string | null;
  status: BossRunStatus;
  objective: string;
  plan_json: unknown;
  messages_json: unknown[];
  report: string | null;
  error: string | null;
  tool_calls: number;
  max_tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  token_budget: number;
  verify_done: boolean;
  /**
   * UI locale of the agent who started the run ("zh-Hans"), or null for
   * English. Decides the language of the report Max writes back -- never the
   * language of a message to a contact, which follows the contact.
   */
  locale?: string | null;
  finished_at?: string | null;
};

export type BossRunStepRow = {
  id: string;
  run_id: string;
  step_index: number;
  tool_name: string;
  risk_class: string;
  input_json: unknown;
  output_json: ToolOutcome | null;
  status: "running" | "completed" | "pending_approval" | "rejected" | "failed";
  approval_state: "n/a" | "pending" | "approved" | "rejected";
  error: string | null;
};

export type RunStore = {
  loadRun(runId: string): Promise<BossRunRow | null>;
  updateRun(runId: string, patch: Partial<Omit<BossRunRow, "id" | "agent_id">>): Promise<void>;
  /** Insert-or-load: returns the existing row when (run_id, step_index) exists. */
  claimStep(args: {
    runId: string;
    stepIndex: number;
    toolName: string;
    riskClass: string;
    input: unknown;
  }): Promise<{ step: BossRunStepRow; alreadyExisted: boolean }>;
  finishStep(
    runId: string,
    stepIndex: number,
    patch: Partial<Pick<BossRunStepRow, "output_json" | "status" | "approval_state" | "error">>,
  ): Promise<void>;
  loadSteps(runId: string): Promise<BossRunStepRow[]>;
};

export class SupabaseRunStore implements RunStore {
  async loadRun(runId: string): Promise<BossRunRow | null> {
    const { data } = await supabaseAdmin.from("boss_runs").select("*").eq("id", runId).maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      ...(row as unknown as BossRunRow),
      agent_id: String(row.agent_id),
      messages_json: Array.isArray(row.messages_json) ? (row.messages_json as unknown[]) : [],
    };
  }

  async updateRun(
    runId: string,
    patch: Partial<Omit<BossRunRow, "id" | "agent_id">>,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("boss_runs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) throw new Error(`boss_runs update failed: ${error.message}`);
  }

  async claimStep(args: {
    runId: string;
    stepIndex: number;
    toolName: string;
    riskClass: string;
    input: unknown;
  }): Promise<{ step: BossRunStepRow; alreadyExisted: boolean }> {
    const { data, error } = await supabaseAdmin
      .from("boss_run_steps")
      .insert({
        run_id: args.runId,
        step_index: args.stepIndex,
        tool_name: args.toolName,
        risk_class: args.riskClass,
        input_json: args.input ?? {},
        status: "running",
      })
      .select("*")
      .single();
    if (!error && data) return { step: data as unknown as BossRunStepRow, alreadyExisted: false };

    // Unique violation → the step already ran (retry path). Load it.
    const { data: existing } = await supabaseAdmin
      .from("boss_run_steps")
      .select("*")
      .eq("run_id", args.runId)
      .eq("step_index", args.stepIndex)
      .maybeSingle();
    if (!existing) throw new Error(error?.message ?? "boss_run_steps claim failed");
    return { step: existing as unknown as BossRunStepRow, alreadyExisted: true };
  }

  async finishStep(
    runId: string,
    stepIndex: number,
    patch: Partial<Pick<BossRunStepRow, "output_json" | "status" | "approval_state" | "error">>,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("boss_run_steps")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("step_index", stepIndex);
    if (error) throw new Error(`boss_run_steps update failed: ${error.message}`);
  }

  async loadSteps(runId: string): Promise<BossRunStepRow[]> {
    const { data } = await supabaseAdmin
      .from("boss_run_steps")
      .select("*")
      .eq("run_id", runId)
      .order("step_index", { ascending: true });
    return (data ?? []) as unknown as BossRunStepRow[];
  }
}

export class InMemoryRunStore implements RunStore {
  runs = new Map<string, BossRunRow>();
  steps = new Map<string, BossRunStepRow>();

  async loadRun(runId: string): Promise<BossRunRow | null> {
    const r = this.runs.get(runId);
    return r ? { ...r, messages_json: [...r.messages_json] } : null;
  }
  async updateRun(runId: string, patch: Partial<BossRunRow>): Promise<void> {
    const r = this.runs.get(runId);
    if (!r) throw new Error("run not found");
    Object.assign(r, patch);
  }
  async claimStep(args: {
    runId: string;
    stepIndex: number;
    toolName: string;
    riskClass: string;
    input: unknown;
  }): Promise<{ step: BossRunStepRow; alreadyExisted: boolean }> {
    const key = `${args.runId}:${args.stepIndex}`;
    const existing = this.steps.get(key);
    if (existing) return { step: existing, alreadyExisted: true };
    const step: BossRunStepRow = {
      id: key,
      run_id: args.runId,
      step_index: args.stepIndex,
      tool_name: args.toolName,
      risk_class: args.riskClass,
      input_json: args.input,
      output_json: null,
      status: "running",
      approval_state: "n/a",
      error: null,
    };
    this.steps.set(key, step);
    return { step, alreadyExisted: false };
  }
  async finishStep(
    runId: string,
    stepIndex: number,
    patch: Partial<BossRunStepRow>,
  ): Promise<void> {
    const s = this.steps.get(`${runId}:${stepIndex}`);
    if (!s) throw new Error("step not found");
    Object.assign(s, patch);
  }
  async loadSteps(runId: string): Promise<BossRunStepRow[]> {
    return [...this.steps.values()]
      .filter((s) => s.run_id === runId)
      .sort((a, b) => a.step_index - b.step_index);
  }
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkerId } from "./workers";
import type { RiskClass, ToolOutcome } from "./tools/types";

/**
 * Durable state for Nina's agent loop. The engine only touches runs through
 * this interface, so tests can drive it entirely in memory.
 *
 * Every read tolerates a pre-migration database, in line with the rest of this
 * app (migrations here are user-applied). `missionsReady()` is the gate the UI
 * uses to hide the whole feature until the tables exist, rather than showing a
 * goal box that throws when you type in it.
 */

export type RunStatus =
  | "planning"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "budget_exceeded"
  | "cancelled";

export type StepStatus = "running" | "completed" | "pending_approval" | "rejected" | "failed";
export type ApprovalState = "n/a" | "pending" | "approved" | "rejected";

export type AgentRunRow = {
  id: string;
  user_id: string;
  mission_id: string | null;
  worker: WorkerId;
  parent_run_id: string | null;
  trigger: "command" | "cron" | "retry";
  status: RunStatus;
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
  credits_spent: number;
  max_credits: number | null;
  verify_done: boolean;
  finished_at?: string | null;
};

export type AgentRunStepRow = {
  id: string;
  run_id: string;
  user_id: string;
  step_index: number;
  worker: WorkerId;
  tool_name: string;
  risk_class: RiskClass | "unknown";
  input_json: unknown;
  output_json: ToolOutcome | null;
  summary: string | null;
  artifact_url: string | null;
  credits_spent: number;
  status: StepStatus;
  approval_state: ApprovalState;
  error: string | null;
  created_at: string;
};

export type RunStore = {
  loadRun(runId: string): Promise<AgentRunRow | null>;
  updateRun(runId: string, patch: Partial<Omit<AgentRunRow, "id" | "user_id">>): Promise<void>;
  /** Insert-or-load: returns the existing row when (run_id, step_index) already exists. */
  claimStep(args: {
    runId: string;
    userId: string;
    stepIndex: number;
    worker: WorkerId;
    toolName: string;
    riskClass: RiskClass | "unknown";
    input: unknown;
  }): Promise<{ step: AgentRunStepRow; alreadyExisted: boolean }>;
  finishStep(
    runId: string,
    stepIndex: number,
    patch: Partial<Pick<AgentRunStepRow, "output_json" | "summary" | "artifact_url" | "credits_spent" | "status" | "approval_state" | "error">>,
  ): Promise<void>;
  loadSteps(runId: string): Promise<AgentRunStepRow[]>;
};

function tableMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return (
    (m.includes("agent_runs") || m.includes("agent_run_steps") || m.includes("missions")) &&
    (m.includes("does not exist") || m.includes("schema cache"))
  );
}

/** True once migrations 0025–0026 have been applied. Cached per process. */
let readyCache: boolean | null = null;
export async function missionsReady(): Promise<boolean> {
  if (readyCache !== null) return readyCache;
  const admin = createAdminClient();
  const { error } = await admin.from("missions").select("id").limit(1);
  readyCache = !error || !tableMissing(error.message);
  return readyCache;
}

export function createRunStore(): RunStore {
  const admin = createAdminClient();

  return {
    async loadRun(runId) {
      const { data, error } = await admin.from("agent_runs").select("*").eq("id", runId).maybeSingle();
      if (error) {
        if (tableMissing(error.message)) return null;
        throw new Error(error.message);
      }
      if (!data) return null;
      const row = data as AgentRunRow;
      // messages_json is jsonb; guard against a hand-edited row.
      return { ...row, messages_json: Array.isArray(row.messages_json) ? row.messages_json : [] };
    },

    async updateRun(runId, patch) {
      const { error } = await admin.from("agent_runs").update(patch).eq("id", runId);
      if (error && !tableMissing(error.message)) throw new Error(error.message);
    },

    async claimStep({ runId, userId, stepIndex, worker, toolName, riskClass, input }) {
      // The unique (run_id, step_index) constraint is what makes a replayed
      // invocation safe: the insert loses, and we return the winner's row.
      const { data, error } = await admin
        .from("agent_run_steps")
        .insert({
          run_id: runId,
          user_id: userId,
          step_index: stepIndex,
          worker,
          tool_name: toolName,
          risk_class: riskClass,
          input_json: input,
          status: "running",
        })
        .select("*")
        .single();

      if (!error && data) return { step: data as AgentRunStepRow, alreadyExisted: false };

      const existing = await admin
        .from("agent_run_steps")
        .select("*")
        .eq("run_id", runId)
        .eq("step_index", stepIndex)
        .maybeSingle();
      if (existing.data) return { step: existing.data as AgentRunStepRow, alreadyExisted: true };
      throw new Error(error?.message ?? "Could not record this step.");
    },

    async finishStep(runId, stepIndex, patch) {
      const { error } = await admin
        .from("agent_run_steps")
        .update(patch)
        .eq("run_id", runId)
        .eq("step_index", stepIndex);
      if (error && !tableMissing(error.message)) throw new Error(error.message);
    },

    async loadSteps(runId) {
      const { data, error } = await admin
        .from("agent_run_steps")
        .select("*")
        .eq("run_id", runId)
        .order("step_index", { ascending: true });
      if (error) {
        if (tableMissing(error.message)) return [];
        throw new Error(error.message);
      }
      return (data as AgentRunStepRow[]) ?? [];
    },
  };
}

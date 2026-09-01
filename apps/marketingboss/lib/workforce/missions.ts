import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRunStore, type AgentRunRow, type AgentRunStepRow } from "./store";
import { createModelClient } from "./model";
import { driveRun } from "./engine";
import { buildSystemPrompt } from "./prompt";
import { isConversionShaped, listDestinations } from "./destinations";
import { loadBrief } from "./tools/impl/_shared";
import type { WorkerId } from "./workers";

/**
 * Mission lifecycle — create, drive, read, approve, cancel.
 *
 * A mission is the owner's objective; a run is one chain of Nina's reasoning
 * against it. The split matters because a mission survives across many runs
 * (approval pauses, continuations, retries) while a run is disposable.
 */

export type MissionStatus = "planning" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
export type Autonomy = "review" | "assisted" | "auto";
export type MeasuredBy = "awareness" | "engagement" | "traffic";

export type Mission = {
  id: string;
  objective: string;
  status: MissionStatus;
  autonomy: Autonomy;
  measured_by: MeasuredBy;
  plan_json: unknown;
  budget_credits: number | null;
  spent_credits: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

function tableMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return (m.includes("missions") || m.includes("agent_run")) && (m.includes("does not exist") || m.includes("schema cache"));
}

// ── reads ────────────────────────────────────────────────────────────

export async function listMissions(userId: string, limit = 10): Promise<Mission[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("missions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Mission[]) ?? [];
}

export async function getMission(userId: string, id: string): Promise<Mission | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("missions").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) return null;
  return (data as Mission) ?? null;
}

export type MissionDetail = {
  mission: Mission;
  runs: AgentRunRow[];
  steps: AgentRunStepRow[];
};

/** Mission plus every run and step — the mission page's single query. */
export async function getMissionDetail(userId: string, id: string): Promise<MissionDetail | null> {
  const mission = await getMission(userId, id);
  if (!mission) return null;

  const admin = createAdminClient();
  const { data: runData } = await admin
    .from("agent_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("mission_id", id)
    .order("started_at", { ascending: true });
  const runs = (runData as AgentRunRow[]) ?? [];

  if (runs.length === 0) return { mission, runs, steps: [] };

  const { data: stepData } = await admin
    .from("agent_run_steps")
    .select("*")
    .eq("user_id", userId)
    .in(
      "run_id",
      runs.map((r) => r.id),
    )
    .order("created_at", { ascending: true });

  return { mission, runs, steps: (stepData as AgentRunStepRow[]) ?? [] };
}

/** Which workers are doing something right now, for the rail. */
export function activeWorkers(steps: AgentRunStepRow[]): Record<WorkerId, "working" | "waiting" | "done"> {
  const out = {} as Record<WorkerId, "working" | "waiting" | "done">;
  for (const s of steps) {
    if (s.status === "running") out[s.worker] = "working";
    else if (s.status === "pending_approval") out[s.worker] = out[s.worker] === "working" ? "working" : "waiting";
    else if (!out[s.worker]) out[s.worker] = "done";
  }
  return out;
}

// ── create ───────────────────────────────────────────────────────────

/** Infer what the mission can honestly be measured on from how it was worded. */
export function inferMeasuredBy(objective: string): MeasuredBy {
  if (isConversionShaped(objective)) return "traffic";
  if (/\b(aware|awareness|reach|visib|exposure|known|brand)\w*\b/i.test(objective)) return "awareness";
  return "engagement";
}

export type CreateMissionResult =
  | { ok: true; missionId: string; runId: string }
  | { ok: false; error: string; needs: "brand_profile" | "destination" | "not_ready" };

/**
 * Open a mission and its first run. Two gates run BEFORE any model call,
 * because both produce a better answer from the owner than from a guess:
 *
 *  1. No brand brief → every plan would be generic, and half of discovery is
 *     dead without one (see lib/discovery.ts skipping seasonal and trends).
 *  2. Conversion-shaped goal with no destination configured → the campaign
 *     would run at nothing. Ask where, rather than defaulting to a homepage.
 */
export async function createMission(
  userId: string,
  objective: string,
  opts?: { autonomy?: Autonomy; budgetCredits?: number | null; maxCredits?: number | null },
): Promise<CreateMissionResult> {
  const admin = createAdminClient();
  const goal = objective.trim().slice(0, 2000);

  const [brief, destinations] = await Promise.all([
    loadBrief(userId).catch(() => null),
    listDestinations(userId).catch(() => []),
  ]);

  if (!brief) {
    return {
      ok: false,
      needs: "brand_profile",
      error:
        "I don't know this business yet, so anything I planned would be generic. Add your website in Settings → " +
        "Business profile and I'll research it first — it takes about a minute.",
    };
  }
  if (isConversionShaped(goal) && destinations.length === 0) {
    return {
      ok: false,
      needs: "destination",
      error:
        "This goal is about turning attention into customers, but there's nowhere for people to land yet. Add the " +
        "web address people should go to in Settings → Business profile, then ask me again.",
    };
  }

  const measuredBy = inferMeasuredBy(goal);

  const { data: missionRow, error: missionErr } = await admin
    .from("missions")
    .insert({
      user_id: userId,
      objective: goal,
      status: "planning",
      autonomy: opts?.autonomy ?? "review",
      measured_by: measuredBy,
      budget_credits: opts?.budgetCredits ?? null,
    })
    .select("id")
    .single();

  if (missionErr || !missionRow) {
    if (tableMissing(missionErr?.message)) {
      return { ok: false, needs: "not_ready", error: "Missions aren't set up on this account yet." };
    }
    return { ok: false, needs: "not_ready", error: "I couldn't open that mission. Please try again." };
  }

  const missionId = (missionRow as { id: string }).id;

  const { data: runRow, error: runErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      mission_id: missionId,
      worker: "nina",
      trigger: "command",
      status: "planning",
      objective: goal,
      max_credits: opts?.maxCredits ?? opts?.budgetCredits ?? null,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    await admin.from("missions").update({ status: "failed", summary: "Could not start." }).eq("id", missionId);
    return { ok: false, needs: "not_ready", error: "I couldn't start work on that mission. Please try again." };
  }

  return { ok: true, missionId, runId: (runRow as { id: string }).id };
}

// ── drive ────────────────────────────────────────────────────────────

/**
 * Advance a run and mirror its outcome onto the mission. Returns whether the
 * caller should kick it again (the run hit its soft deadline mid-flight).
 */
export async function advanceRun(runId: string, opts?: { softDeadlineMs?: number }): Promise<{ status: string; needsContinuation: boolean }> {
  const store = createRunStore();
  const run = await store.loadRun(runId);
  if (!run) return { status: "failed", needsContinuation: false };

  const mission = run.mission_id ? await getMissionById(run.mission_id) : null;

  const result = await driveRun(runId, {
    store,
    model: createModelClient(),
    buildSystemPrompt: (r) => buildSystemPrompt(r, mission),
    softDeadlineMs: opts?.softDeadlineMs,
  });

  if (run.mission_id) {
    const fresh = await store.loadRun(runId);
    const admin = createAdminClient();
    await admin
      .from("missions")
      .update({
        status: missionStatusFor(result.status),
        summary: fresh?.report ?? null,
        plan_json: fresh?.plan_json ?? null,
        spent_credits: fresh?.credits_spent ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.mission_id);
  }

  return result;
}

function missionStatusFor(runStatus: string): MissionStatus {
  switch (runStatus) {
    case "completed":
      return "completed";
    case "awaiting_approval":
      return "awaiting_approval";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "budget_exceeded":
      return "failed";
    default:
      return "running";
  }
}

async function getMissionById(id: string): Promise<{ measured_by: MeasuredBy; autonomy: Autonomy } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("missions").select("measured_by, autonomy").eq("id", id).maybeSingle();
  return (data as { measured_by: MeasuredBy; autonomy: Autonomy } | null) ?? null;
}

// ── decisions ────────────────────────────────────────────────────────

/**
 * Record the owner's decision on a parked step and resume the run.
 *
 * Approving does NOT re-execute the tool here. The proposal already parked
 * something durable — a scheduled post the owner can see — so approving marks
 * it decided and lets Nina carry on. Re-running the send would risk publishing
 * twice, which is exactly the failure the step ledger exists to prevent.
 */
export async function decideStep(
  userId: string,
  stepId: string,
  decision: "approved" | "rejected",
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_run_steps")
    .select("id, run_id, approval_state")
    .eq("user_id", userId)
    .eq("id", stepId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "I couldn't find that step." };

  const step = data as { id: string; run_id: string; approval_state: string };
  if (step.approval_state !== "pending") {
    return { ok: false, error: "That step has already been decided." };
  }

  await admin
    .from("agent_run_steps")
    .update({ approval_state: decision, status: decision === "approved" ? "completed" : "rejected" })
    .eq("id", stepId);

  // If nothing else is pending on this run, hand it back to Nina.
  const { data: stillPending } = await admin
    .from("agent_run_steps")
    .select("id")
    .eq("run_id", step.run_id)
    .eq("approval_state", "pending")
    .limit(1);

  if (!stillPending || stillPending.length === 0) {
    await admin.from("agent_runs").update({ status: "running" }).eq("id", step.run_id);
    // Tell the model what happened so its next turn reflects the decision.
    await appendDecisionNote(step.run_id, decision);
  }

  return { ok: true, runId: step.run_id };
}

async function appendDecisionNote(runId: string, decision: "approved" | "rejected"): Promise<void> {
  const store = createRunStore();
  const run = await store.loadRun(runId);
  if (!run) return;
  const messages = [...run.messages_json];
  messages.push({
    role: "user",
    content:
      decision === "approved"
        ? "The owner approved the step that was waiting. It is committed — do not repeat it. Continue with anything still outstanding, then report."
        : "The owner rejected the step that was waiting. Do not retry it. Continue with anything still outstanding, or report what remains.",
  });
  await store.updateRun(runId, { messages_json: messages });
}

export async function cancelMission(userId: string, missionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("missions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", missionId);
  await admin
    .from("agent_runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("mission_id", missionId)
    .in("status", ["planning", "running", "awaiting_approval"]);
}

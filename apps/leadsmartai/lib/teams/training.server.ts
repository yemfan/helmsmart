import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { TRAINING_MAX_ITEMS, type Completion, type Training, type TrainingInput } from "./training";

type TrainingRow = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  starts_at: string | null;
  location: string | null;
  materials_url: string | null;
  due_on: string | null;
  created_by_agent_id: unknown;
  created_at: string;
};

type CompletionRow = { training_id: string; agent_id: unknown; completed_at: string; recorded_by_agent_id: unknown };

const TRAINING_COLS = "id, title, description, required, starts_at, location, materials_url, due_on, created_by_agent_id, created_at";

function toTraining(r: TrainingRow): Training {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    required: r.required,
    startsAt: r.starts_at,
    location: r.location,
    materialsUrl: r.materials_url,
    dueOn: r.due_on,
    createdBy: String(r.created_by_agent_id),
    createdAt: r.created_at,
  };
}

function toCompletion(r: CompletionRow): Completion {
  return {
    trainingId: r.training_id,
    agentId: String(r.agent_id),
    completedAt: r.completed_at,
    recordedBy: r.recorded_by_agent_id == null ? null : String(r.recorded_by_agent_id),
  };
}

export async function listTrainings(teamId: string): Promise<Training[]> {
  try {
    const { data } = await supabaseAdmin
      .from("team_trainings")
      .select(TRAINING_COLS)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(TRAINING_MAX_ITEMS);
    return ((data as TrainingRow[] | null) ?? []).map(toTraining);
  } catch (e) {
    console.warn("[teams.training] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Every completion on the team (managers), or one agent's own (members). */
export async function listCompletions(teamId: string, agentId: string | null): Promise<Completion[]> {
  try {
    let q = supabaseAdmin
      .from("team_training_completions")
      .select("training_id, agent_id, completed_at, recorded_by_agent_id")
      .eq("team_id", teamId);
    if (agentId) q = q.eq("agent_id", agentId as never);
    const { data } = await q.limit(20000);
    return ((data as CompletionRow[] | null) ?? []).map(toCompletion);
  } catch (e) {
    console.warn("[teams.training] completions failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function addTraining(teamId: string, byAgentId: string, t: TrainingInput): Promise<Training> {
  const { count } = await supabaseAdmin.from("team_trainings").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  if ((count ?? 0) >= TRAINING_MAX_ITEMS) throw new Error("training_full");
  const { data, error } = await supabaseAdmin
    .from("team_trainings")
    .insert({
      team_id: teamId,
      title: t.title,
      description: t.description,
      required: t.required,
      starts_at: t.startsAt,
      location: t.location,
      materials_url: t.materialsUrl,
      due_on: t.dueOn,
      created_by_agent_id: byAgentId,
    } as never)
    .select(TRAINING_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toTraining(data as TrainingRow);
}

/** Removes the class and, by cascade, its attendance record. */
export async function removeTraining(teamId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("team_trainings").delete().eq("team_id", teamId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

export type SetCompletionResult =
  | { ok: true; completion: Completion | null }
  | { ok: false; reason: "not_found" | "not_yours" };

/**
 * Record or clear one agent's completion of one class. `asManager` lets the
 * caller clear a record someone else made; an agent can only clear what they
 * recorded themselves, so a manager-confirmed attendance stays put.
 */
export async function setCompletion(args: {
  teamId: string;
  trainingId: string;
  agentId: string;
  done: boolean;
  byAgentId: string;
  asManager: boolean;
}): Promise<SetCompletionResult> {
  const { data: training } = await supabaseAdmin
    .from("team_trainings")
    .select("id")
    .eq("team_id", args.teamId)
    .eq("id", args.trainingId)
    .maybeSingle();
  if (!training) return { ok: false, reason: "not_found" };

  if (args.done) {
    const { data, error } = await supabaseAdmin
      .from("team_training_completions")
      .upsert(
        {
          training_id: args.trainingId,
          team_id: args.teamId,
          agent_id: args.agentId,
          completed_at: new Date().toISOString(),
          recorded_by_agent_id: args.byAgentId,
        } as never,
        { onConflict: "training_id,agent_id" },
      )
      .select("training_id, agent_id, completed_at, recorded_by_agent_id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, completion: toCompletion(data as CompletionRow) };
  }

  if (!args.asManager) {
    const { data: existing } = await supabaseAdmin
      .from("team_training_completions")
      .select("recorded_by_agent_id")
      .eq("training_id", args.trainingId)
      .eq("agent_id", args.agentId as never)
      .maybeSingle();
    const by = (existing as { recorded_by_agent_id?: unknown } | null)?.recorded_by_agent_id;
    if (existing && by != null && String(by) !== args.byAgentId) return { ok: false, reason: "not_yours" };
  }
  const { error } = await supabaseAdmin
    .from("team_training_completions")
    .delete()
    .eq("training_id", args.trainingId)
    .eq("agent_id", args.agentId as never);
  if (error) throw new Error(error.message);
  return { ok: true, completion: null };
}

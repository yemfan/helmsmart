import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";

type Db = SupabaseClient<Database>;

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface CreateTaskInput {
  title: string;
  notes?: string;
  due_date?: string;
  client_id?: string;
  priority?: TaskPriority;
}

/** Create a task. Org-scoped; caller revalidates. */
export async function insertTask(db: Db, orgId: string, input: CreateTaskInput): Promise<void> {
  const { error } = await db.from("tasks").insert({
    organization_id: orgId,
    title: input.title,
    notes: input.notes ?? null,
    due_date: input.due_date ?? null,
    client_id: input.client_id || null,
    priority: input.priority ?? "normal",
    status: "open",
  });
  if (error) throw new Error(error.message);
}

/**
 * What a task write touched. `found: false` means no row changed — through the
 * RLS client that is how a refused write looks (not an error), so callers must
 * not report it as done. A database error throws.
 */
export interface TaskWriteResult {
  found: boolean;
  clientId: string | null;
}

/** Update a task's status. Returns the task's client_id so the caller can revalidate it. */
export async function setTaskStatus(
  db: Db,
  orgId: string,
  taskId: string,
  status: TaskStatus
): Promise<TaskWriteResult> {
  const { data, error } = await db
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("organization_id", orgId)
    .select("client_id");
  if (error) throw new Error(error.message);
  const task = data?.[0];
  return { found: !!task, clientId: task?.client_id ?? null };
}

/** Delete a task. Returns the task's client_id so the caller can revalidate it. */
export async function deleteTask(
  db: Db,
  orgId: string,
  taskId: string
): Promise<TaskWriteResult> {
  const { data, error } = await db
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("organization_id", orgId)
    .select("client_id");
  if (error) throw new Error(error.message);
  const task = data?.[0];
  return { found: !!task, clientId: task?.client_id ?? null };
}

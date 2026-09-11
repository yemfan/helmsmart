"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import {
  insertTask,
  setTaskStatus,
  deleteTask as deleteTaskOps,
  type TaskStatus,
  type TaskPriority,
} from "@helm/dna-operations";
import { checkActionPermission } from "@/components/role-guard";

// Org-scoped task CRUD lives in @helm/dna-operations (Operations DNA). These server
// actions own org resolution + revalidation.

export async function createTask(data: {
  title: string;
  notes?: string;
  due_date?: string;
  client_id?: string;
  priority?: TaskPriority;
}) {
  const denied = await checkActionPermission("pipeline.write");
  if (denied) throw new Error(denied.error);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.notAuthenticated"));

  const supabase = await createClient();
  await insertTask(supabase, orgId, data);
  revalidatePath("/tasks");
  if (data.client_id) revalidatePath(`/clients/${data.client_id}`);
}

// Status and delete return a result: the task row shows the new state before
// the write lands, and through the RLS client a refused write matches zero rows
// without erroring — so "found" is the only proof anything changed.

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("tasks");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();
  let res: { found: boolean; clientId: string | null };
  try {
    res = await setTaskStatus(supabase, orgId, taskId, status);
  } catch (e) {
    console.error("[tasks] status update failed:", e);
    return { ok: false, error: t("errors.taskFailed") };
  }
  if (!res.found) return { ok: false, error: t("errors.taskRefused") };

  revalidatePath("/tasks");
  if (res.clientId) revalidatePath(`/clients/${res.clientId}`);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("tasks");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();
  let res: { found: boolean; clientId: string | null };
  try {
    res = await deleteTaskOps(supabase, orgId, taskId);
  } catch (e) {
    console.error("[tasks] delete failed:", e);
    return { ok: false, error: t("errors.taskFailed") };
  }
  if (!res.found) return { ok: false, error: t("errors.taskRefused") };

  revalidatePath("/tasks");
  if (res.clientId) revalidatePath(`/clients/${res.clientId}`);
  return { ok: true };
}

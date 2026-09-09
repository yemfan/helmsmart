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

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.notAuthenticated"));

  const supabase = await createClient();
  const { clientId } = await setTaskStatus(supabase, orgId, taskId, status);
  revalidatePath("/tasks");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function deleteTask(taskId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.notAuthenticated"));

  const supabase = await createClient();
  const { clientId } = await deleteTaskOps(supabase, orgId, taskId);
  revalidatePath("/tasks");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

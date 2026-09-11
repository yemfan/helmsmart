"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "annually";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type RecurringTask = {
  id: string;
  client_id: string | null;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  frequency: RecurringFrequency;
  next_run_date: string;
  status: "active" | "paused";
  last_generated_at: string | null;
  clients?: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

async function getOrgId(): Promise<string | null> {
  return getMemberOrgId();
}

export async function listRecurringTasks(): Promise<RecurringTask[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_tasks")
    .select(
      "id, client_id, title, notes, priority, frequency, next_run_date, status, last_generated_at, clients(first_name, last_name, company)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    ...r,
    clients: (Array.isArray(r.clients) ? r.clients[0] : r.clients) ?? null,
  })) as RecurringTask[];
}

export async function createRecurringTask(data: {
  title: string;
  notes: string | null;
  clientId: string | null;
  priority: TaskPriority;
  frequency: RecurringFrequency;
  nextRunDate: string;
}): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));
  if (!data.title.trim()) throw new Error((await getServerT("tasks"))("errors.titleRequired"));
  if (!data.nextRunDate) throw new Error((await getServerT("tasks"))("errors.firstRunDateRequired"));

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_tasks").insert({
    organization_id: orgId,
    client_id: data.clientId,
    title: data.title.trim(),
    notes: data.notes,
    priority: data.priority,
    frequency: data.frequency,
    next_run_date: data.nextRunDate,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tasks/recurring");
}

export async function setRecurringTaskStatus(
  id: string,
  status: "active" | "paused"
): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_tasks")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/tasks/recurring");
}

export async function deleteRecurringTask(id: string): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_tasks")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/tasks/recurring");
}

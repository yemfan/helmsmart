"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "annually";

export type RecurringProject = {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  color: string;
  budget_hours: number | null;
  budget_amount: number | null;
  hourly_rate: number | null;
  frequency: RecurringFrequency;
  next_run_date: string;
  status: "active" | "paused";
  last_generated_at: string | null;
  clients?: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

async function getOrgId(): Promise<string | null> {
  return getMemberOrgId();
}

export async function listRecurringProjects(): Promise<RecurringProject[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_projects")
    .select(
      "id, client_id, name, description, color, budget_hours, budget_amount, hourly_rate, frequency, next_run_date, status, last_generated_at, clients(first_name, last_name, company)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    ...r,
    clients: (Array.isArray(r.clients) ? r.clients[0] : r.clients) ?? null,
  })) as RecurringProject[];
}

export async function createRecurringProject(data: {
  name: string;
  clientId: string | null;
  description: string | null;
  color: string;
  budgetHours: number | null;
  hourlyRate: number | null;
  frequency: RecurringFrequency;
  nextRunDate: string;
}): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("projects"))("errors.noOrg"));
  if (!data.name.trim()) throw new Error((await getServerT("projects"))("errors.nameRequired"));
  if (!data.nextRunDate) throw new Error((await getServerT("projects"))("errors.firstRunDateRequired"));

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_projects").insert({
    organization_id: orgId,
    client_id: data.clientId,
    name: data.name.trim(),
    description: data.description,
    color: data.color,
    budget_hours: data.budgetHours,
    hourly_rate: data.hourlyRate,
    frequency: data.frequency,
    next_run_date: data.nextRunDate,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/projects/recurring");
}

export async function setRecurringProjectStatus(
  id: string,
  status: "active" | "paused"
): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("projects"))("errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_projects")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/projects/recurring");
}

export async function deleteRecurringProject(id: string): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error((await getServerT("projects"))("errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("recurring_projects")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/projects/recurring");
}

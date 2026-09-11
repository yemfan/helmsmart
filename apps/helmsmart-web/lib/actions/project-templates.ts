"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { createProject } from "./projects";
import { getMemberOrgId } from "@/lib/auth/org-context";

export interface TemplateTask {
  title: string;
  priority: "urgent" | "high" | "normal" | "low";
  offset_days?: number; // days after project start date
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  color: string;
  budget_hours?: number;
  hourly_rate?: number;
  default_duration_days?: number;
  default_tasks: TemplateTask[];
  usage_count: number;
  created_at: string;
}

/**
 * List all project templates for the current org
 */
export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
  const orgId = await getMemberOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_templates")
    .select("*")
    .eq("organization_id", orgId)
    .order("usage_count", { ascending: false });

  return (data ?? []) as ProjectTemplate[];
}

/**
 * Create a new project template
 */
export async function createProjectTemplate(input: {
  name: string;
  description?: string;
  color?: string;
  budgetHours?: number;
  hourlyRate?: number;
  defaultDurationDays?: number;
  defaultTasks?: TemplateTask[];
}): Promise<{ ok: boolean; templateId?: string; error?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("projects"))("errors.notAuthenticated") };

  const db = await createServiceClient();

  const { data: tpl, error } = await db
    .from("project_templates")
    .insert({
      organization_id: orgId,
      name: input.name,
      description: input.description || null,
      color: input.color ?? "indigo",
      budget_hours: input.budgetHours ?? null,
      hourly_rate: input.hourlyRate ?? null,
      default_duration_days: input.defaultDurationDays ?? null,
      default_tasks: input.defaultTasks ?? [],
    })
    .select("id")
    .single();

  if (error || !tpl) {
    console.error("[project-templates] create error:", error);
    return { ok: false, error: error?.message || (await getServerT("projects"))("errors.createTemplateFailed") };
  }

  revalidatePath("/projects/templates");
  return { ok: true, templateId: tpl.id };
}

/**
 * Update a project template
 */
export async function updateProjectTemplate(
  templateId: string,
  input: {
    name?: string;
    description?: string;
    color?: string;
    budgetHours?: number | null;
    hourlyRate?: number | null;
    defaultDurationDays?: number | null;
    defaultTasks?: TemplateTask[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("projects"))("errors.notAuthenticated") };

  const db = await createServiceClient();
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.color !== undefined) updates.color = input.color;
  if (input.budgetHours !== undefined) updates.budget_hours = input.budgetHours;
  if (input.hourlyRate !== undefined) updates.hourly_rate = input.hourlyRate;
  if (input.defaultDurationDays !== undefined) updates.default_duration_days = input.defaultDurationDays;
  if (input.defaultTasks !== undefined) updates.default_tasks = input.defaultTasks;

  const { error } = await db
    .from("project_templates")
    .update(updates)
    .eq("id", templateId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/projects/templates");
  return { ok: true };
}

/**
 * Delete a project template
 */
export async function deleteProjectTemplate(
  templateId: string
): Promise<{ ok: boolean; error?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("projects"))("errors.notAuthenticated") };

  const db = await createServiceClient();
  const { error } = await db
    .from("project_templates")
    .delete()
    .eq("id", templateId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/projects/templates");
  return { ok: true };
}

/**
 * Create a project from a template — creates the project + all default tasks
 */
export async function createProjectFromTemplate(
  templateId: string,
  overrides: {
    name?: string;
    clientId?: string;
    startDate?: string;
  }
): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("projects"))("errors.notAuthenticated") };

  const supabase = await createClient();

  // Load template
  const { data: tpl } = await supabase
    .from("project_templates")
    .select("*")
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .single();

  if (!tpl) return { ok: false, error: (await getServerT("projects"))("errors.templateNotFound") };

  // Create the project
  let projectId: string;
  try {
    const startDate = overrides.startDate || new Date().toISOString().slice(0, 10);
    const endDate = tpl.default_duration_days
      ? new Date(new Date(startDate).getTime() + tpl.default_duration_days * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;

    projectId = await createProject({
      name: overrides.name || tpl.name,
      description: tpl.description ?? null,
      clientId: overrides.clientId ?? null,
      color: tpl.color as Parameters<typeof createProject>[0]["color"],
      budgetHours: tpl.budget_hours ? Number(tpl.budget_hours) : null,
      hourlyRate: tpl.hourly_rate ? Number(tpl.hourly_rate) : null,
      startDate,
      endDate,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : (await getServerT("projects"))("errors.createProjectFailed") };
  }

  // Create default tasks
  const defaultTasks = (tpl.default_tasks ?? []) as TemplateTask[];
  if (defaultTasks.length > 0) {
    const db = await createServiceClient();
    const startDate = overrides.startDate || new Date().toISOString().slice(0, 10);

    await db.from("tasks").insert(
      defaultTasks.map((task) => {
        const dueDate = task.offset_days
          ? new Date(new Date(startDate).getTime() + task.offset_days * 86_400_000)
              .toISOString()
              .slice(0, 10)
          : null;
        return {
          organization_id: orgId,
          project_id: projectId,
          client_id: overrides.clientId ?? null,
          title: task.title,
          priority: task.priority ?? "normal",
          status: "open",
          due_date: dueDate,
        };
      })
    );
  }

  // Bump usage count
  const db = await createServiceClient();
  await db
    .from("project_templates")
    .update({ usage_count: (tpl.usage_count ?? 0) + 1 })
    .eq("id", templateId);

  revalidatePath("/projects");
  return { ok: true, projectId };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createNotification } from "./notifications";
import { getMemberOrgId } from "@/lib/auth/org-context";

/**
 * Checks whether a project has newly crossed a budget threshold (80% / 100%
 * of its hours or dollar budget) and, if so, fires a notification. Ratchets
 * projects.budget_alert_level so each threshold alerts at most once.
 *
 * Safe no-op for projects without a budget. Call after any change that
 * increases burn (time entry saved, expense tagged to the project).
 *
 * Lives in its own module (rather than projects.ts) to avoid a circular
 * import with expenses.ts, which calls this from createExpense.
 */
export async function checkProjectBudgetAlert(projectId: string): Promise<void> {
  const orgId = await getMemberOrgId();
  if (!orgId) return;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, budget_hours, budget_amount, budget_alert_level")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .single();

  if (!project) return;
  if (!project.budget_hours && !project.budget_amount) return; // no budget to burn

  const { data: entries } = await supabase
    .from("time_entries")
    .select("duration_minutes, billable, hourly_rate")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .not("ended_at", "is", null);

  let totalMinutes = 0;
  let billableAmount = 0;
  for (const e of entries ?? []) {
    const mins = e.duration_minutes ?? 0;
    totalMinutes += mins;
    if (e.billable) billableAmount += (mins / 60) * Number(e.hourly_rate ?? 0);
  }

  const hoursBurn = project.budget_hours
    ? totalMinutes / 60 / Number(project.budget_hours)
    : 0;
  const amountBurn = project.budget_amount
    ? billableAmount / Number(project.budget_amount)
    : 0;
  const burnPct = Math.max(hoursBurn, amountBurn) * 100;

  const newLevel = burnPct >= 100 ? 100 : burnPct >= 80 ? 80 : 0;
  const currentLevel = Number(project.budget_alert_level ?? 0);
  if (newLevel <= currentLevel) return; // no higher threshold newly crossed

  await createNotification({
    type: "system",
    title:
      newLevel === 100
        ? `${project.name} is over budget`
        : `${project.name} is nearing budget`,
    body: `This project has used ${burnPct.toFixed(0)}% of its budget.`,
    titleKey:
      newLevel === 100
        ? "notifications.events.budgetOver"
        : "notifications.events.budgetNearing",
    bodyKey: "notifications.events.budgetBody",
    // The project's own name is data — it is never translated.
    params: { project: project.name, percent: burnPct.toFixed(0) },
    link: `/projects/${projectId}`,
  });

  await supabase
    .from("projects")
    .update({ budget_alert_level: newLevel })
    .eq("id", projectId)
    .eq("organization_id", orgId);
}

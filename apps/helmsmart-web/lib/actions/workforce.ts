"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import {
  seedCoreRoster,
  listEmployees,
  getMetrics,
  setEmployeeAvatar,
  type AiEmployee,
  type AiEmployeeMetric,
} from "@helm/ai-workforce";
import { rollUpWorkforce, type WorkforceSummary } from "@helm/dna-intelligence";
import { getMemberOrgId } from "@/lib/auth/org-context";

async function orgScope() {
  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) throw new Error((await getServerT("home"))("errors.notAuthenticated"));
  const supabase = await createClient();
  return { orgId, supabase };
}

/** Seed the six Core AI employees into the current org (idempotent — safe to re-run). */
export async function seedWorkforce(): Promise<{ seeded: number }> {
  const { orgId, supabase } = await orgScope();
  return seedCoreRoster(supabase, orgId);
}

/** The org's AI employees, for the workforce settings UI. */
export async function getWorkforce(): Promise<AiEmployee[]> {
  const { orgId, supabase } = await orgScope();
  return listEmployees(supabase, orgId);
}

/** Assign a persona avatar (one of the 20) to an AI employee. */
export async function setEmployeeAvatarAction(employeeId: string, avatar: string): Promise<void> {
  if (!/^persona-\d{2}$/.test(avatar)) throw new Error((await getServerT("home"))("errors.invalidAvatar"));
  const { orgId, supabase } = await orgScope();
  await setEmployeeAvatar(supabase, orgId, employeeId, avatar);
  revalidatePath("/command-center");
}

/** Daily AI-workforce metrics across a date range — the Command Center's KPI source. */
export async function getWorkforceMetrics(from: string, to: string): Promise<AiEmployeeMetric[]> {
  const { orgId, supabase } = await orgScope();
  return getMetrics(supabase, orgId, { from, to });
}

/**
 * The Executive Command Center's AI Workforce node: each employee's KPIs summed over
 * [from, to], plus org-wide totals, busiest-first. Bridges the AI Workforce runtime
 * (directory + metrics) and the Intelligence DNA read-model (rollUpWorkforce) — neither
 * Core package imports the other; this app layer composes them.
 */
export async function getWorkforceSummary(from: string, to: string): Promise<WorkforceSummary> {
  const { orgId, supabase } = await orgScope();
  const [employees, metrics] = await Promise.all([
    listEmployees(supabase, orgId),
    getMetrics(supabase, orgId, { from, to }),
  ]);
  return rollUpWorkforce(
    employees.map((e) => ({ id: e.id, slug: e.slug, name: e.name, role: e.role })),
    metrics.map((m) => ({ employeeId: m.employeeId, metricKey: m.metricKey, metricValue: m.metricValue })),
    from,
    to
  );
}

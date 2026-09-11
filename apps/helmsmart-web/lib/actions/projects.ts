"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { getProjectExpenseTotal } from "./expenses";
import { checkActionPermission } from "@/components/role-guard";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type ProjectStatus = "active" | "paused" | "completed" | "cancelled";
export type ProjectColor  = "indigo" | "emerald" | "rose" | "amber" | "violet" | "slate";

export type Project = {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: ProjectColor;
  budget_hours: number | null;
  budget_amount: number | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  // Joined
  clients?: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

async function getOrgId(): Promise<string> {
  const id = await getMemberOrgId();
  if (!id) throw new Error((await getServerT("projects"))("errors.noOrg"));
  return id;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  let q = supabase
    .from("projects")
    .select("id, client_id, name, description, status, color, budget_hours, budget_amount, hourly_rate, start_date, end_date, created_at, clients(first_name, last_name, company)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...row,
    clients: (Array.isArray(row.clients) ? row.clients[0] : row.clients) ?? null,
  })) as Project[];
}

// ─── List with P&L (portfolio profitability) ──────────────────────────────────

export type ProjectPnL = {
  revenue: number;        // invoiced billable time
  laborCost: number;      // Σ hours × (cost_rate ?? org default)
  expensesTotal: number;  // tagged expenses
  profit: number;
  margin: number | null;  // profit / revenue (null when no revenue yet)
};

export type ProjectWithPnL = Project & { pnl: ProjectPnL };

/**
 * Per-project P&L for the whole org, computed in a fixed number of queries
 * (projects + all time entries + all project expense JEs + org labor rate),
 * aggregated in memory — no N+1 per project.
 */
export async function listProjectsPnL(status?: ProjectStatus): Promise<ProjectWithPnL[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  let projectQuery = supabase
    .from("projects")
    .select("id, client_id, name, description, status, color, budget_hours, budget_amount, hourly_rate, start_date, end_date, created_at, clients(first_name, last_name, company)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (status) projectQuery = projectQuery.eq("status", status);

  const [
    { data: projectRows, error },
    { data: entries },
    { data: expenseJEs },
    { data: org },
  ] = await Promise.all([
    projectQuery,
    supabase
      .from("time_entries")
      .select("project_id, duration_minutes, billable, hourly_rate, cost_rate, invoiced")
      .eq("organization_id", orgId)
      .not("project_id", "is", null)
      .not("ended_at", "is", null),
    supabase
      .from("journal_entries")
      .select("project_id, journal_lines(debit, account:account_id(type))")
      .eq("organization_id", orgId)
      .eq("source_type", "expense")
      .not("project_id", "is", null),
    supabase.from("organizations").select("default_labor_cost_rate").eq("id", orgId).single(),
  ]);

  if (error) throw new Error(error.message);

  const defaultLaborRate = Number(org?.default_labor_cost_rate ?? 0);

  // Time → revenue (invoiced) + labor cost (all worked time) per project
  const timeByProject = new Map<string, { revenue: number; laborCost: number }>();
  for (const e of entries ?? []) {
    const pid = e.project_id as string | null;
    if (!pid) continue;
    const mins = e.duration_minutes ?? 0;
    const costRate = Number(e.cost_rate ?? defaultLaborRate);
    const agg = timeByProject.get(pid) ?? { revenue: 0, laborCost: 0 };
    agg.laborCost += (mins / 60) * costRate;
    if (e.billable && e.invoiced) {
      agg.revenue += (mins / 60) * Number(e.hourly_rate ?? 0);
    }
    timeByProject.set(pid, agg);
  }

  // Expenses → sum expense-type debit lines per project
  type LineShape = { debit: number; account: { type: string } | { type: string }[] | null };
  const expenseByProject = new Map<string, number>();
  for (const je of expenseJEs ?? []) {
    const pid = (je as { project_id: string | null }).project_id;
    if (!pid) continue;
    const lines = ((je as { journal_lines?: LineShape[] }).journal_lines ?? []);
    let sum = 0;
    for (const l of lines) {
      const acct = Array.isArray(l.account) ? l.account[0] : l.account;
      if (Number(l.debit) > 0 && acct?.type === "expense") sum += Number(l.debit);
    }
    expenseByProject.set(pid, (expenseByProject.get(pid) ?? 0) + sum);
  }

  return (projectRows ?? []).map((row) => {
    const t = timeByProject.get(row.id) ?? { revenue: 0, laborCost: 0 };
    const expensesTotal = expenseByProject.get(row.id) ?? 0;
    const revenue = t.revenue;
    const profit = revenue - t.laborCost - expensesTotal;
    const margin = revenue > 0 ? profit / revenue : null;
    return {
      ...row,
      clients: (Array.isArray(row.clients) ? row.clients[0] : row.clients) ?? null,
      pnl: { revenue, laborCost: t.laborCost, expensesTotal, profit, margin },
    } as ProjectWithPnL;
  });
}

// ─── Client profitability (roll-up) ───────────────────────────────────────────

export type ClientPnL = {
  clientId: string;
  name: string;
  revenue: number;        // total invoiced to the client (non-draft, non-void)
  laborCost: number;      // labor on their projects
  expensesTotal: number;  // expenses tagged to their projects
  profit: number;         // revenue − laborCost − expensesTotal
  margin: number | null;
};

/**
 * Per-client P&L: revenue is everything billed to the client (their invoices),
 * cost is the labor + expenses tracked against their projects. Built on top of
 * listProjectsPnL() plus one invoices query and one clients query — no N+1.
 *
 * Note: cost only reflects work tracked via projects; flat-fee clients with no
 * projects will show their billings as ~100% margin.
 */
export async function listClientsPnL(): Promise<ClientPnL[]> {
  const t = await getServerT("projects");
  const orgId = await getOrgId();
  const supabase = await createClient();

  const [projects, { data: invoices }, { data: clients }] = await Promise.all([
    listProjectsPnL(),
    supabase
      .from("invoices")
      .select("client_id, total, status")
      .eq("organization_id", orgId)
      .not("status", "in", "(draft,void)"),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", orgId),
  ]);

  // Cost per client, summed from their projects
  const costByClient = new Map<string, { laborCost: number; expensesTotal: number }>();
  for (const p of projects) {
    if (!p.client_id) continue;
    const c = costByClient.get(p.client_id) ?? { laborCost: 0, expensesTotal: 0 };
    c.laborCost += p.pnl.laborCost;
    c.expensesTotal += p.pnl.expensesTotal;
    costByClient.set(p.client_id, c);
  }

  // Revenue per client, from issued invoices
  const revenueByClient = new Map<string, number>();
  for (const inv of invoices ?? []) {
    const cid = (inv as { client_id: string | null }).client_id;
    if (!cid) continue;
    revenueByClient.set(cid, (revenueByClient.get(cid) ?? 0) + Number(inv.total));
  }

  return (clients ?? []).map((c) => {
    const name =
      [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || t("errors.unnamedClient");
    const cost = costByClient.get(c.id) ?? { laborCost: 0, expensesTotal: 0 };
    const revenue = revenueByClient.get(c.id) ?? 0;
    const profit = revenue - cost.laborCost - cost.expensesTotal;
    const margin = revenue > 0 ? profit / revenue : null;
    return {
      clientId: c.id,
      name,
      revenue,
      laborCost: cost.laborCost,
      expensesTotal: cost.expensesTotal,
      profit,
      margin,
    };
  });
}

// ─── Get single project + stats ───────────────────────────────────────────────

export async function getProject(projectId: string): Promise<{
  project: Project;
  stats: {
    totalMinutes: number;
    billableMinutes: number;
    billableAmount: number;
    invoicedAmount: number;
    openTasks: number;
    completedTasks: number;
    // Profitability (Week 27)
    laborCost: number;
    expensesTotal: number;
    revenue: number;        // realized = invoiced billable time
    profit: number;         // revenue − laborCost − expensesTotal
    margin: number | null;  // profit / revenue (null when no revenue yet)
  };
} | null> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const [{ data: project }, { data: entries }, { data: tasks }, { data: org }, expensesTotal] = await Promise.all([
    supabase
      .from("projects")
      .select("id, client_id, name, description, status, color, budget_hours, budget_amount, hourly_rate, start_date, end_date, created_at, clients(first_name, last_name, company)")
      .eq("id", projectId)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("time_entries")
      .select("duration_minutes, billable, hourly_rate, cost_rate, invoiced, ended_at")
      .eq("organization_id", orgId)
      .eq("project_id", projectId)
      .not("ended_at", "is", null),
    supabase
      .from("tasks")
      .select("id, completed")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
    supabase
      .from("organizations")
      .select("default_labor_cost_rate")
      .eq("id", orgId)
      .single(),
    getProjectExpenseTotal(projectId),
  ]);

  if (!project) return null;

  const defaultLaborRate = Number(org?.default_labor_cost_rate ?? 0);

  let totalMinutes = 0, billableMinutes = 0, billableAmount = 0, invoicedAmount = 0, laborCost = 0;
  for (const e of entries ?? []) {
    const mins = e.duration_minutes ?? 0;
    totalMinutes += mins;
    // Labor cost accrues on all worked time, billable or not.
    const costRate = Number(e.cost_rate ?? defaultLaborRate);
    laborCost += (mins / 60) * costRate;
    if (e.billable) {
      billableMinutes += mins;
      const amt = (mins / 60) * Number(e.hourly_rate ?? 0);
      billableAmount += amt;
      if (e.invoiced) invoicedAmount += amt;
    }
  }

  const openTasks      = (tasks ?? []).filter((t) => !t.completed).length;
  const completedTasks = (tasks ?? []).filter((t) => t.completed).length;

  // Revenue = realized (invoiced) billable time. Profit nets labor + expenses.
  const revenue = invoicedAmount;
  const profit  = revenue - laborCost - expensesTotal;
  const margin  = revenue > 0 ? profit / revenue : null;

  return {
    project: {
      ...project,
      clients: (Array.isArray(project.clients) ? project.clients[0] : project.clients) ?? null,
    } as Project,
    stats: {
      totalMinutes, billableMinutes, billableAmount, invoicedAmount,
      openTasks, completedTasks,
      laborCost, expensesTotal, revenue, profit, margin,
    },
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createProject(data: {
  name: string;
  description?: string | null;
  clientId?: string | null;
  color?: ProjectColor;
  budgetHours?: number | null;
  budgetAmount?: number | null;
  hourlyRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<string> {
  const denied = await checkActionPermission("pipeline.write");
  if (denied) throw new Error(denied.error);
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: proj, error } = await supabase
    .from("projects")
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      client_id: data.clientId ?? null,
      color: data.color ?? "indigo",
      budget_hours: data.budgetHours ?? null,
      budget_amount: data.budgetAmount ?? null,
      hourly_rate: data.hourlyRate ?? null,
      start_date: data.startDate ?? null,
      end_date: data.endDate ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  return proj.id;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateProject(
  projectId: string,
  data: Partial<{
    name: string;
    description: string | null;
    clientId: string | null;
    status: ProjectStatus;
    color: ProjectColor;
    budgetHours: number | null;
    budgetAmount: number | null;
    hourlyRate: number | null;
    startDate: string | null;
    endDate: string | null;
  }>
): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name        !== undefined) patch.name         = data.name;
  if (data.description !== undefined) patch.description  = data.description;
  if (data.clientId    !== undefined) patch.client_id    = data.clientId;
  if (data.status      !== undefined) patch.status       = data.status;
  if (data.color       !== undefined) patch.color        = data.color;
  if (data.budgetHours !== undefined) patch.budget_hours = data.budgetHours;
  if (data.budgetAmount!== undefined) patch.budget_amount= data.budgetAmount;
  // Re-arm budget alerts when the budget itself changes.
  if (data.budgetHours !== undefined || data.budgetAmount !== undefined) {
    patch.budget_alert_level = 0;
  }
  if (data.hourlyRate  !== undefined) patch.hourly_rate  = data.hourlyRate;
  if (data.startDate   !== undefined) patch.start_date   = data.startDate;
  if (data.endDate     !== undefined) patch.end_date     = data.endDate;

  await supabase.from("projects").update(patch).eq("id", projectId).eq("organization_id", orgId);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteProject(projectId: string): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  await supabase.from("projects").delete().eq("id", projectId).eq("organization_id", orgId);
  revalidatePath("/projects");
}

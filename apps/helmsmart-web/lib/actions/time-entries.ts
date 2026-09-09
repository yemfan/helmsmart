"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";
import { checkProjectBudgetAlert } from "./budget-alerts";

export type TimeEntry = {
  id: string;
  client_id: string | null;
  project: string | null;       // legacy free-text field (kept for backward compat)
  project_id: string | null;    // FK to projects table
  description: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  billable: boolean;
  hourly_rate: number | null;
  invoiced: boolean;
  invoice_id: string | null;
  created_at: string;
  clients?: { first_name: string | null; last_name: string | null; company: string | null } | null;
  projects?: { name: string; color: string } | null;  // joined from projects table
};

const ENTRY_SELECT =
  "id, client_id, project, project_id, description, started_at, ended_at, " +
  "duration_minutes, billable, hourly_rate, invoiced, invoice_id, created_at, " +
  "clients(first_name, last_name, company), projects(name, color)";

function normalizeEntry(row: Record<string, unknown>): TimeEntry {
  return {
    ...row,
    clients: (Array.isArray(row.clients) ? (row.clients as unknown[])[0] : row.clients) ?? null,
    projects: (Array.isArray(row.projects) ? (row.projects as unknown[])[0] : row.projects) ?? null,
  } as TimeEntry;
}

async function getOrgId(): Promise<string> {
  const cookieStore = await cookies();
  const id = cookieStore.get("helmsmart-org-id")?.value;
  if (!id) throw new Error((await getServerT("projects"))("errors.noOrg"));
  return id;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listTimeEntries(opts?: {
  clientId?: string;
  projectId?: string;
  from?: string;   // ISO date
  to?: string;     // ISO date
  invoiced?: boolean;
}): Promise<TimeEntry[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  let query = supabase
    .from("time_entries")
    .select(ENTRY_SELECT)
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false })
    .limit(200);

  if (opts?.clientId)            query = query.eq("client_id", opts.clientId);
  if (opts?.projectId)           query = query.eq("project_id", opts.projectId);
  if (opts?.from)                query = query.gte("started_at", opts.from);
  if (opts?.to)                  query = query.lte("started_at", opts.to + "T23:59:59.999Z");
  if (opts?.invoiced !== undefined) query = query.eq("invoiced", opts.invoiced);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => normalizeEntry(row as unknown as Record<string, unknown>));
}

// ─── Get active timer ─────────────────────────────────────────────────────────

export async function getActiveTimer(): Promise<TimeEntry | null> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("time_entries")
    .select(ENTRY_SELECT)
    .eq("organization_id", orgId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return normalizeEntry(data as unknown as Record<string, unknown>);
}

// ─── Start timer ──────────────────────────────────────────────────────────────

export async function startTimer(data: {
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  billable?: boolean;
  hourlyRate?: number | null;
}): Promise<string> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  // Stop any running timer first
  await supabase
    .from("time_entries")
    .update({
      ended_at: new Date().toISOString(),
      duration_minutes: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .is("ended_at", null);

  const { data: entry, error } = await supabase
    .from("time_entries")
    .insert({
      organization_id: orgId,
      client_id: data.clientId ?? null,
      project_id: data.projectId ?? null,
      description: data.description ?? "",
      started_at: new Date().toISOString(),
      billable: data.billable ?? true,
      hourly_rate: data.hourlyRate ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/timesheets");
  return entry.id;
}

// ─── Stop timer ───────────────────────────────────────────────────────────────

export async function stopTimer(entryId: string): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("time_entries")
    .select("started_at, project_id")
    .eq("id", entryId)
    .eq("organization_id", orgId)
    .single();

  if (!entry) return;

  const endedAt = new Date();
  const startedAt = new Date(entry.started_at);
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  await supabase
    .from("time_entries")
    .update({
      ended_at: endedAt.toISOString(),
      duration_minutes: Math.max(1, durationMinutes),
      updated_at: endedAt.toISOString(),
    })
    .eq("id", entryId)
    .eq("organization_id", orgId);

  revalidatePath("/timesheets");
  if (entry.project_id) await checkProjectBudgetAlert(entry.project_id);
}

// ─── Create manual entry ──────────────────────────────────────────────────────

export async function createTimeEntry(data: {
  description: string;
  clientId?: string | null;
  projectId?: string | null;
  project?: string | null;     // legacy text — deprecated, prefer projectId
  startedAt: string;
  durationMinutes: number;
  billable: boolean;
  hourlyRate?: number | null;
}): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const startedAt = new Date(data.startedAt);
  const endedAt   = new Date(startedAt.getTime() + data.durationMinutes * 60000);

  const { error } = await supabase.from("time_entries").insert({
    organization_id: orgId,
    client_id: data.clientId ?? null,
    project_id: data.projectId ?? null,
    project: data.project ?? null,
    description: data.description,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_minutes: data.durationMinutes,
    billable: data.billable,
    hourly_rate: data.hourlyRate ?? null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/timesheets");
  if (data.projectId) await checkProjectBudgetAlert(data.projectId);
}

// ─── Update entry ─────────────────────────────────────────────────────────────

export async function updateTimeEntry(
  entryId: string,
  data: Partial<{
    description: string;
    clientId: string | null;
    projectId: string | null;
    project: string | null;    // legacy
    durationMinutes: number;
    billable: boolean;
    hourlyRate: number | null;
  }>
): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.description !== undefined)    patch.description     = data.description;
  if (data.clientId    !== undefined)    patch.client_id       = data.clientId;
  if (data.projectId   !== undefined)    patch.project_id      = data.projectId;
  if (data.project     !== undefined)    patch.project         = data.project;
  if (data.durationMinutes !== undefined) {
    patch.duration_minutes = data.durationMinutes;
    const { data: row } = await supabase
      .from("time_entries")
      .select("started_at")
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .single();
    if (row) {
      patch.ended_at = new Date(
        new Date(row.started_at).getTime() + data.durationMinutes * 60000
      ).toISOString();
    }
  }
  if (data.billable    !== undefined) patch.billable     = data.billable;
  if (data.hourlyRate  !== undefined) patch.hourly_rate  = data.hourlyRate;

  await supabase
    .from("time_entries")
    .update(patch)
    .eq("id", entryId)
    .eq("organization_id", orgId);

  revalidatePath("/timesheets");
}

// ─── Delete entry ─────────────────────────────────────────────────────────────

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId)
    .eq("organization_id", orgId);

  revalidatePath("/timesheets");
}

// ─── Import time entries into an invoice ─────────────────────────────────────
// Creates invoice lines from selected entries and marks them as invoiced.

export async function importTimeEntriesToInvoice(
  invoiceId: string,
  entryIds: string[]
): Promise<void> {
  const orgId = await getOrgId();
  const db = await createServiceClient();

  // Verify invoice belongs to this org
  const { data: inv } = await db
    .from("invoices")
    .select("id, organization_id")
    .eq("id", invoiceId)
    .eq("organization_id", orgId)
    .single();
  if (!inv) throw new Error((await getServerT("projects"))("errors.invoiceNotFound"));

  // Fetch entries with project join for label
  const { data: entries } = await db
    .from("time_entries")
    .select("id, description, project, project_id, duration_minutes, hourly_rate, billable, projects(name)")
    .in("id", entryIds)
    .eq("organization_id", orgId)
    .eq("invoiced", false);

  if (!entries?.length) return;

  // Determine current max sort_order
  const { data: existingLines } = await db
    .from("invoice_lines")
    .select("sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: false })
    .limit(1);

  let sortOrder = (existingLines?.[0]?.sort_order ?? 0) + 1;

  // Build invoice lines — prefer FK project name over legacy text field
  const lines = entries.map((e) => {
    const hours = (e.duration_minutes ?? 0) / 60;
    const rate = e.hourly_rate ?? 0;
    const projectsData = Array.isArray(e.projects) ? e.projects[0] : e.projects;
    const projectName = (projectsData as { name?: string } | null)?.name ?? e.project ?? null;
    // Deliberately NOT translated. This string is persisted as
    // `invoice_lines.description` and rendered on /pay/[id] — the page the
    // CUSTOMER opens, not owner chrome. `getServerT` here would resolve the
    // OWNER's cookie (the person clicking Import) and freeze their UI language
    // onto a line their client reads, permanently, with no way for the pay page
    // to re-render it. Same rule as reply drafts and reminders in
    // docs/i18n-howto.md: customer-facing copy follows the customer, never the
    // owner's locale. Every other label on this line is untranslated user data
    // (project name + the owner's own description); this fallback matches.
    const label = [projectName, e.description].filter(Boolean).join(" — ") || "Billable time";
    return {
      invoice_id: invoiceId,
      description: label,
      quantity: parseFloat(hours.toFixed(2)),
      unit_price: rate,
      amount: parseFloat((hours * rate).toFixed(2)),
      sort_order: sortOrder++,
    };
  });

  await db.from("invoice_lines").insert(lines);

  // Update invoice subtotal/total
  const { data: allLines } = await db
    .from("invoice_lines")
    .select("amount")
    .eq("invoice_id", invoiceId);

  const subtotal = (allLines ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const { data: invFull } = await db
    .from("invoices")
    .select("tax_rate")
    .eq("id", invoiceId)
    .single();

  const taxRate = Number(invFull?.tax_rate ?? 0);
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  await db.from("invoices").update({
    subtotal: subtotal.toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    updated_at: new Date().toISOString(),
  }).eq("id", invoiceId);

  // Mark entries as invoiced
  await db
    .from("time_entries")
    .update({ invoiced: true, invoice_id: invoiceId, updated_at: new Date().toISOString() })
    .in("id", entryIds)
    .eq("organization_id", orgId);

  revalidatePath("/timesheets");
  revalidatePath(`/books/invoices/${invoiceId}`);
}

// ─── Week stats ───────────────────────────────────────────────────────────────

export async function getTimeStats(from: string, to: string): Promise<{
  totalMinutes: number;
  billableMinutes: number;
  billableAmount: number;
  uninvoicedAmount: number;
}> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("time_entries")
    .select("duration_minutes, billable, hourly_rate, invoiced")
    .eq("organization_id", orgId)
    .not("ended_at", "is", null)
    .gte("started_at", from)
    .lte("started_at", to + "T23:59:59.999Z");

  const entries = data ?? [];
  let totalMinutes = 0, billableMinutes = 0, billableAmount = 0, uninvoicedAmount = 0;

  for (const e of entries) {
    const mins = e.duration_minutes ?? 0;
    totalMinutes += mins;
    if (e.billable) {
      billableMinutes += mins;
      const amt = (mins / 60) * Number(e.hourly_rate ?? 0);
      billableAmount += amt;
      if (!e.invoiced) uninvoicedAmount += amt;
    }
  }

  return { totalMinutes, billableMinutes, billableAmount, uninvoicedAmount };
}

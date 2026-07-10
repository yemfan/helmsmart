import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { persistCommissionDefaults } from "./applyCommissionDefaults";
import { addDaysIso, applyDeadlineDefaults } from "./deadlineDefaults";
import { applyOnCloseBackfill } from "./onCloseBackfill";
import { seedTasksFor } from "./seedTasks";
import { maybeAutoStartFromTransaction } from "@/lib/realtyboss/playbook-runs/auto";
import type {
  CounterpartyRole,
  TransactionCounterpartyRow,
  TransactionListItem,
  TransactionRow,
  TransactionTaskRow,
  TransactionType,
} from "./types";

/**
 * Service layer for the transaction coordinator.
 *
 * CRUD + a couple of derived operations:
 *   * `createTransaction` — inserts the row AND seeds the task list
 *     from lib/transactions/seedTasks.ts in a single request so the
 *     agent lands on a useful detail page on first load.
 *   * `listTransactionsForAgent` — joins task-completion counts so the
 *     list page doesn't N+1.
 *   * `updateTransaction` — re-runs `applyDeadlineDefaults` whenever
 *     `mutual_acceptance_date` changes, so setting the anchor auto-
 *     populates contingency deadlines.
 *
 * All writes use `supabaseAdmin` (service role) to bypass RLS — the
 * API routes enforce agent ownership at the auth layer.
 */

// ─────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────

export type CreateTransactionInput = {
  agentId: string;
  contactId: string;
  propertyAddress: string;
  transactionType?: TransactionType;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  purchasePrice?: number | null;
  listingStartDate?: string | null;
  mutualAcceptanceDate?: string | null;
  closingDate?: string | null;
  notes?: string | null;
};

export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRow> {
  const transactionType = input.transactionType ?? "buyer_rep";

  // Compose the inserted row. Auto-fill deadline defaults if we have
  // a mutual-acceptance anchor up front.
  const base = {
    agent_id: input.agentId,
    contact_id: input.contactId,
    transaction_type: transactionType,
    property_address: input.propertyAddress,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    purchase_price: input.purchasePrice ?? null,
    listing_start_date: input.listingStartDate ?? null,
    mutual_acceptance_date: input.mutualAcceptanceDate ?? null,
    closing_date: input.closingDate ?? null,
    notes: input.notes ?? null,
  };
  const defaultsPatch = applyDeadlineDefaults({
    mutual_acceptance_date: base.mutual_acceptance_date,
    inspection_deadline: null,
    appraisal_deadline: null,
    loan_contingency_deadline: null,
    closing_date: base.closing_date,
  });
  const row = { ...base, ...defaultsPatch };

  const { data: inserted, error } = await supabaseAdmin
    .from("transactions")
    .insert(row)
    .select("*")
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to create transaction");
  }

  // Seed the task list. Each seed task picks an anchor date from the
  // transaction row — either mutual_acceptance_date or listing_start_date
  // — and computes due_date as anchor + offsetDays. If the chosen anchor
  // is null, due_date stays null and the agent fills it when the anchor
  // date lands.
  const mutualAcceptance = row.mutual_acceptance_date;
  const listingStart = row.listing_start_date;
  const seedRows = seedTasksFor(transactionType).map((t, idx) => {
    const anchorDate =
      t.anchor === "listing_start" ? listingStart : mutualAcceptance;
    return {
      transaction_id: (inserted as TransactionRow).id,
      stage: t.stage,
      title: t.title,
      description: t.description ?? null,
      due_date:
        anchorDate && t.offsetDays != null
          ? addDaysIso(anchorDate, t.offsetDays)
          : null,
      order_index: idx,
      seed_key: t.seedKey,
      source: "seed" as const,
    };
  });

  if (seedRows.length > 0) {
    const { error: taskError } = await supabaseAdmin.from("transaction_tasks").insert(seedRows);
    if (taskError) {
      // Non-fatal — the transaction row exists; operator can re-seed
      // later or manually add tasks. But log loudly because this is a
      // degraded create.
      console.error("[transactions.create] seed task insert failed:", taskError.message);
    }
  }

  // Opt-in playbook auto-start: a listing_rep/dual transaction kicks off the
  // selling playbook; a buyer_rep transaction the buying playbook. Best-effort —
  // never blocks or fails the transaction create.
  await maybeAutoStartFromTransaction({
    agentId: input.agentId,
    transactionType,
    propertyAddress: input.propertyAddress,
    contactId: input.contactId,
  });

  return inserted as TransactionRow;
}

// ─────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────

export async function listTransactionsForAgent(agentId: string): Promise<TransactionListItem[]> {
  // Three batched queries — transactions, contacts (by id), and task
  // counts — joined in memory. Was a single PostgREST embed
  // (`contacts!inner(...)`) but that fails on production whenever
  // PostgREST's schema cache loses the transactions→contacts FK.
  // Plain selects are robust regardless of cache state.
  const { data: txns, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("agent_id", agentId)
    .order("closing_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!txns || txns.length === 0) return [];

  const txnRows = txns as TransactionRow[];
  const ids = txnRows.map((t) => t.id);
  const contactIds = Array.from(
    new Set(txnRows.map((t) => t.contact_id).filter((v): v is string => Boolean(v))),
  );

  type ContactRow = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
  };

  const [contactRes, tasksRes] = await Promise.all([
    contactIds.length > 0
      ? supabaseAdmin
          .from("contacts")
          .select("id, name, first_name, last_name")
          .in("id", contactIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null as null }),
    supabaseAdmin
      .from("transaction_tasks")
      .select("transaction_id, due_date, completed_at")
      .in("transaction_id", ids),
  ]);
  if (contactRes.error) throw new Error(contactRes.error.message);

  const contactNameById = new Map<string, string | null>();
  for (const c of (contactRes.data ?? []) as ContactRow[]) {
    const name =
      (c.first_name && c.last_name
        ? `${c.first_name} ${c.last_name}`.trim()
        : c.name) ?? null;
    contactNameById.set(c.id, name);
  }

  const today = new Date().toISOString().slice(0, 10);
  const byTxn = new Map<string, { total: number; completed: number; overdue: number }>();
  for (const t of (tasksRes.data ?? []) as Array<{
    transaction_id: string;
    due_date: string | null;
    completed_at: string | null;
  }>) {
    const counter = byTxn.get(t.transaction_id) ?? { total: 0, completed: 0, overdue: 0 };
    counter.total += 1;
    if (t.completed_at) counter.completed += 1;
    else if (t.due_date && t.due_date < today) counter.overdue += 1;
    byTxn.set(t.transaction_id, counter);
  }

  return txnRows.map((t) => {
    const counter = byTxn.get(t.id) ?? { total: 0, completed: 0, overdue: 0 };
    const contactName = t.contact_id ? contactNameById.get(t.contact_id) ?? null : null;
    return {
      ...t,
      contact_name: contactName,
      task_total: counter.total,
      task_completed: counter.completed,
      task_overdue: counter.overdue,
    };
  });
}

export async function getTransactionWithChildren(
  agentId: string,
  id: string,
): Promise<{
  transaction: TransactionRow;
  tasks: TransactionTaskRow[];
  counterparties: TransactionCounterpartyRow[];
  contactName: string | null;
} | null> {
  // Plain select on transactions; contact name fetched separately so
  // the page doesn't break on PostgREST schema-cache misses.
  const { data: txn, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!txn) return null;

  const transaction = txn as TransactionRow;

  type ContactRow = {
    name: string | null;
    first_name: string | null;
    last_name: string | null;
  };

  const [contactRes, tasksRes, counterpartiesRes] = await Promise.all([
    transaction.contact_id
      ? supabaseAdmin
          .from("contacts")
          .select("name, first_name, last_name")
          .eq("id", transaction.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null as ContactRow | null, error: null as null }),
    supabaseAdmin
      .from("transaction_tasks")
      .select("*")
      .eq("transaction_id", id)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("transaction_counterparties")
      .select("*")
      .eq("transaction_id", id)
      .order("role", { ascending: true }),
  ]);
  if (contactRes.error) throw new Error(contactRes.error.message);

  const c = contactRes.data as ContactRow | null;
  const contactName =
    (c?.first_name && c?.last_name
      ? `${c.first_name} ${c.last_name}`.trim()
      : c?.name) ?? null;

  return {
    transaction,
    tasks: (tasksRes.data ?? []) as TransactionTaskRow[],
    counterparties: (counterpartiesRes.data ?? []) as TransactionCounterpartyRow[],
    contactName,
  };
}

// ─────────────────────────────────────────────────────────────────────
// UPDATE — transaction
// ─────────────────────────────────────────────────────────────────────

export type UpdateTransactionInput = Partial<{
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchase_price: number | null;
  status: TransactionRow["status"];
  terminated_reason: string | null;
  listing_start_date: string | null;
  mutual_acceptance_date: string | null;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
  closing_date: string | null;
  closing_date_actual: string | null;
  notes: string | null;
  seller_update_enabled: boolean;
}>;

export async function updateTransaction(
  agentId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow | null> {
  const patch: UpdateTransactionInput & { updated_at: string } = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  // Snapshot pre-update status so we can detect the active→closed edge
  // for the on-close backfill. Single extra read per update; fine.
  const { data: before } = await supabaseAdmin
    .from("transactions")
    .select(
      "status, purchase_price, mutual_acceptance_date, inspection_deadline, appraisal_deadline, loan_contingency_deadline, closing_date",
    )
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();

  // If the agent just set (or cleared + set) `mutual_acceptance_date`,
  // backfill any NULL deadline columns with California defaults.
  if ("mutual_acceptance_date" in input && input.mutual_acceptance_date && before) {
    const merged = { ...before, ...input };
    const defaults = applyDeadlineDefaults(merged as never);
    Object.assign(patch, defaults);
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const updated = (data as TransactionRow | null) ?? null;

  // Fire the on-close backfill after the primary write commits. Awaited so
  // that the API response reflects the contact state actually on disk —
  // clients that navigate to Contacts right after closing shouldn't see
  // stale data.
  if (updated && before) {
    const beforeStatus = (before as { status: TransactionRow["status"] }).status;
    await applyOnCloseBackfill({ status: beforeStatus }, updated);

    // Compute commission on the active → closed transition. Only runs
    // when the deal just closed; doesn't touch pre-existing commission
    // fields (the helper fills in nulls only). Re-run when price
    // changes too so the GCI / net numbers stay fresh.
    const justClosed = beforeStatus !== "closed" && updated.status === "closed";
    const priceChanged =
      "purchase_price" in input &&
      input.purchase_price !== (before as { purchase_price: number | null }).purchase_price;
    if (justClosed || priceChanged) {
      await persistCommissionDefaults(updated);
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────

export async function addCustomTask(
  agentId: string,
  transactionId: string,
  input: { stage: TransactionTaskRow["stage"]; title: string; description?: string | null; due_date?: string | null },
): Promise<TransactionTaskRow> {
  // Verify ownership before any write.
  const { data: txn } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!txn) throw new Error("Transaction not found");

  const { data: maxOrder } = await supabaseAdmin
    .from("transaction_tasks")
    .select("order_index")
    .eq("transaction_id", transactionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = ((maxOrder as { order_index?: number } | null)?.order_index ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("transaction_tasks")
    .insert({
      transaction_id: transactionId,
      stage: input.stage,
      title: input.title,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      order_index: next,
      source: "custom",
      seed_key: null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add task");
  return data as TransactionTaskRow;
}

export async function updateTask(
  agentId: string,
  taskId: string,
  input: Partial<{
    title: string;
    description: string | null;
    due_date: string | null;
    completed: boolean;
    stage: TransactionTaskRow["stage"];
  }>,
): Promise<TransactionTaskRow | null> {
  // Verify ownership via join.
  const { data: taskRow } = await supabaseAdmin
    .from("transaction_tasks")
    .select("id, transaction_id, transactions!inner(agent_id)")
    .eq("id", taskId)
    .maybeSingle();
  if (!taskRow) return null;
  const ownerAgent = (taskRow as unknown as { transactions: { agent_id: string } }).transactions.agent_id;
  if (String(ownerAgent) !== String(agentId)) return null;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.due_date !== undefined) patch.due_date = input.due_date;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.completed !== undefined) {
    patch.completed_at = input.completed ? new Date().toISOString() : null;
    patch.completed_by = input.completed ? agentId : null;
  }

  const { data, error } = await supabaseAdmin
    .from("transaction_tasks")
    .update(patch)
    .eq("id", taskId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransactionTaskRow | null) ?? null;
}

export async function deleteTask(agentId: string, taskId: string): Promise<boolean> {
  // Ownership join + only custom tasks are deletable. Seeded tasks can
  // be marked complete but not removed — removing them would orphan
  // the seed_key and the checklist would silently shrink when agents
  // later compare deals. If an agent truly wants to hide a seed task,
  // they can complete it and we filter "show completed" in the UI.
  const { data: row } = await supabaseAdmin
    .from("transaction_tasks")
    .select("id, source, transactions!inner(agent_id)")
    .eq("id", taskId)
    .maybeSingle();
  if (!row) return false;
  const ownerAgent = (row as unknown as { transactions: { agent_id: string } }).transactions.agent_id;
  if (String(ownerAgent) !== String(agentId)) return false;
  if ((row as { source: string }).source !== "custom") return false;
  const { error } = await supabaseAdmin.from("transaction_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Counterparties
// ─────────────────────────────────────────────────────────────────────

export async function addCounterparty(
  agentId: string,
  transactionId: string,
  input: {
    role: CounterpartyRole;
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<TransactionCounterpartyRow> {
  const { data: txn } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!txn) throw new Error("Transaction not found");

  const { data, error } = await supabaseAdmin
    .from("transaction_counterparties")
    .insert({
      transaction_id: transactionId,
      role: input.role,
      name: input.name,
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add counterparty");
  return data as TransactionCounterpartyRow;
}

export async function updateCounterparty(
  agentId: string,
  id: string,
  input: Partial<{
    role: CounterpartyRole;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>,
): Promise<TransactionCounterpartyRow | null> {
  const { data: row } = await supabaseAdmin
    .from("transaction_counterparties")
    .select("id, transactions!inner(agent_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  const ownerAgent = (row as unknown as { transactions: { agent_id: string } }).transactions.agent_id;
  if (String(ownerAgent) !== String(agentId)) return null;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["role", "name", "company", "email", "phone", "notes"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const { data, error } = await supabaseAdmin
    .from("transaction_counterparties")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransactionCounterpartyRow | null) ?? null;
}

export async function deleteCounterparty(agentId: string, id: string): Promise<boolean> {
  const { data: row } = await supabaseAdmin
    .from("transaction_counterparties")
    .select("id, transactions!inner(agent_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row) return false;
  const ownerAgent = (row as unknown as { transactions: { agent_id: string } }).transactions.agent_id;
  if (String(ownerAgent) !== String(agentId)) return false;
  const { error } = await supabaseAdmin.from("transaction_counterparties").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}


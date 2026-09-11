/**
 * The AI team's actions, and the production wiring for running them.
 *
 *   key                    employee  risk      calls
 *   find_clients           sarah     read      clients (org-scoped search)
 *   list_overdue_invoices  alex      read      invoices + clients
 *   list_open_tasks        mark      read      tasks + clients
 *   list_recent_calls      emma      read      calls + clients
 *   create_task            mark      internal  insertTask (@helm/dna-operations)
 *   hand_off_to_owner      mark      internal  insertTask + Mark's run (category)
 *   send_invoice_reminder  alex      outbound  sendReminderForInvoice → approval first
 *   text_client            sarah     outbound  sendSmsAsOrg (consent-checked) → approval first
 *
 * Adding one: define it in `./actions/*`, add it here, and — if it is
 * outbound — to APPROVABLE_ACTIONS in `./approval-view.ts` so the card knows
 * it (`registry.test.ts` fails until the two agree).
 */
import { recordEmployeeRun } from "@/lib/workforce-attribution";
import { insertApproval } from "./approvals";
import { createTask, handOffToOwner } from "./actions/internal";
import { sendInvoiceReminder, textClient } from "./actions/outbound";
import { findClients, listOpenTasks, listOverdueInvoices, listRecentCalls } from "./actions/read";
import type { TeamFace } from "./approval-view";
import type { DecideDeps } from "./decide";
import { toJsonSchema } from "./json-schema";
import type { ToolDef } from "./mark-loop";
import type { RunDeps } from "./run-action";
import type { AnyAction } from "./types";

export const AI_TEAM_ACTIONS: readonly AnyAction[] = [
  findClients,
  listOverdueInvoices,
  listOpenTasks,
  listRecentCalls,
  createTask,
  handOffToOwner,
  sendInvoiceReminder,
  textClient,
];

export function getAction(key: string): AnyAction | null {
  return AI_TEAM_ACTIONS.find((a) => a.key === key) ?? null;
}

/**
 * The actions as tool definitions, each description ending with who owns it —
 * the name this business gave that employee — so Mark names the right
 * teammate. Deterministic order: the tools head the cached prefix.
 */
export function toolsForModel(actions: readonly AnyAction[], team: Record<string, TeamFace>): ToolDef[] {
  return actions.map((a) => {
    const face = team[a.employee];
    const owner = face ? ` [Owned by ${face.name}${face.role ? `, ${face.role}` : ""}.]` : "";
    return { name: a.key, description: `${a.description}${owner}`, input_schema: toJsonSchema(a.input) };
  });
}

export const defaultRunDeps: RunDeps = {
  getAction,
  createApproval: (db, orgId, approval) => insertApproval(db, orgId, approval),
  recordRun: (db, orgId, slug, run) => recordEmployeeRun(db, orgId, slug, run),
};

export const defaultDecideDeps: DecideDeps = {
  getAction,
  recordRun: (db, orgId, slug, run) => recordEmployeeRun(db, orgId, slug, run),
};

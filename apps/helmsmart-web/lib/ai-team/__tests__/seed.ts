/** A small business and a stranger's, for the AI-team tests. */
import type { ApprovalRow } from "../approval-view";
import { ORG, OTHER_ORG } from "./context";

export const DANA = "aaaaaaaa-0000-4000-8000-000000000001";
export const PRIYA = "aaaaaaaa-0000-4000-8000-000000000002";
/** A client of ANOTHER business. */
export const STRANGER = "aaaaaaaa-0000-4000-8000-000000000009";
export const INV_1042 = "bbbbbbbb-0000-4000-8000-000000001042";
/** An invoice of ANOTHER business. */
export const INV_OTHER = "bbbbbbbb-0000-4000-8000-000000009999";
export const PROPOSAL = "cccccccc-0000-4000-8000-000000000001";

export function seedTables(): Record<string, Record<string, unknown>[]> {
  return {
    clients: [
      {
        id: DANA,
        organization_id: ORG,
        first_name: "Dana",
        last_name: "Lee",
        company: null,
        email: "dana@example.com",
        phone: "+14155550101",
        preferred_language: "en",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: PRIYA,
        organization_id: ORG,
        first_name: "Priya",
        last_name: "Shah",
        company: null,
        email: null,
        phone: "+14155550143",
        preferred_language: "en",
        status: "active",
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        id: STRANGER,
        organization_id: OTHER_ORG,
        first_name: "Olga",
        last_name: "Other",
        company: null,
        email: "olga@example.com",
        phone: "+14155550199",
        preferred_language: "en",
        status: "active",
        created_at: "2026-01-03T00:00:00Z",
      },
    ],
    invoices: [
      {
        id: INV_1042,
        organization_id: ORG,
        invoice_number: "INV-1042",
        total: 1200,
        due_date: "2026-08-30",
        status: "overdue",
        client_id: DANA,
        reminder_count: 1,
        last_reminder_sent_at: null,
      },
      {
        id: INV_OTHER,
        organization_id: OTHER_ORG,
        invoice_number: "INV-9999",
        total: 50,
        due_date: "2026-08-01",
        status: "overdue",
        client_id: STRANGER,
        reminder_count: 0,
        last_reminder_sent_at: null,
      },
    ],
    communication_preferences: [],
    sms_unsubscribes: [],
    email_unsubscribes: [],
    tasks: [],
    ai_approvals: [],
  };
}

/** A text Sarah proposed to Priya, an hour before "now" in `testContext`. */
export function textProposal(over: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: PROPOSAL,
    organization_id: ORG,
    employee_slug: "sarah",
    action_key: "text_client",
    params: { client_id: PRIYA, message: "Running 10 minutes late!" },
    summary: "Sarah will text Priya Shah at (415) 555-0143",
    details: { kind: "text", clientId: PRIYA, clientName: "Priya Shah", phone: "(415) 555-0143", message: "Running 10 minutes late!" },
    status: "proposed",
    source: {},
    created_at: "2026-09-11T16:00:00.000Z",
    decided_at: null,
    decided_by: null,
    executed_at: null,
    result: null,
    error: null,
    ...over,
  };
}

/** A payment reminder Alex proposed for INV-1042. */
export function reminderProposal(over: Partial<ApprovalRow> = {}): ApprovalRow {
  return textProposal({
    employee_slug: "alex",
    action_key: "send_invoice_reminder",
    params: { invoice_id: INV_1042 },
    summary: "Alex will email a payment reminder to Dana Lee for INV-1042 · $1,200.00",
    details: {
      kind: "invoice_reminder",
      clientId: DANA,
      clientName: "Dana Lee",
      email: "dana@example.com",
      phone: "(415) 555-0101",
      invoiceId: INV_1042,
      invoiceNumber: "INV-1042",
      amount: 1200,
      currency: "USD",
      daysOverdue: 12,
    },
    ...over,
  });
}

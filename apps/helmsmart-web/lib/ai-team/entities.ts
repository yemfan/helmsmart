/**
 * The entities an action may name, loaded only through the caller's org.
 *
 * Every action re-checks every id the model handed it — at preview AND again
 * at execution — with `organization_id = ctx.orgId` in the query itself. The
 * model is not a trusted source of ids: a prompt, a pasted message or a stale
 * transcript can carry another business's uuid, and RLS alone would still let
 * a member of two businesses reach the other one. A row that does not come
 * back here does not exist, as far as the AI team is concerned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneDisplay } from "@/lib/phone-display";

type Db = SupabaseClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export type OrgClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  status: string | null;
};

export const CLIENT_COLUMNS = "id, first_name, last_name, company, email, phone, preferred_language, status";

export async function orgClient(db: Db, orgId: string, id: string | null | undefined): Promise<OrgClient | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`clients lookup failed: ${error.message}`);
  return (data as OrgClient | null) ?? null;
}

/** A client's name as the owner knows them — never empty. */
export function clientName(c: Pick<OrgClient, "first_name" | "last_name" | "company" | "email" | "phone">): string {
  const full = [c.first_name, c.last_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return full || (c.company ?? "").trim() || (c.email ?? "").trim() || formatPhoneDisplay(c.phone) || "—";
}

export type OrgInvoice = {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  status: string;
  client_id: string | null;
  reminder_count: number | null;
  last_reminder_sent_at: string | null;
  organization_id: string;
};

export const INVOICE_COLUMNS =
  "id, invoice_number, total, due_date, status, client_id, reminder_count, last_reminder_sent_at, organization_id";

export async function orgInvoice(db: Db, orgId: string, id: string | null | undefined): Promise<OrgInvoice | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`invoices lookup failed: ${error.message}`);
  return (data as OrgInvoice | null) ?? null;
}

/** Invoice states a payment reminder makes sense for. */
export const UNPAID_INVOICE_STATUSES = ["sent", "overdue"];

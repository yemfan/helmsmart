/**
 * The context an AI-team action runs in, for a member acting inside a
 * request — Ask Mark (`/api/ask`) and `decideApproval`. The caller has
 * already passed `requireOrgMember()`; this only gathers what the actions
 * need: the business's date and currency, the reader's language, and the
 * names this business gave its AI employees.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listEmployees } from "@helm/ai-workforce";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { orgToday } from "@/lib/org-timezone";
import type { OrgRole } from "@/lib/permissions";
import { teamFaces } from "./faces";
import type { ActionContext } from "./types";

export async function buildActionContext(args: {
  db: SupabaseClient;
  orgId: string;
  userId: string | null;
  role: OrgRole | null;
}): Promise<ActionContext> {
  const [locale, home, inbox, clients, currency, today, employees] = await Promise.all([
    getServerLocale(),
    getServerT("home"),
    getServerT("inbox"),
    getServerT("clients"),
    orgCurrency(args.orgId),
    orgToday(args.orgId),
    listEmployees(args.db, args.orgId).catch(() => []),
  ]);
  return {
    db: args.db,
    orgId: args.orgId,
    userId: args.userId,
    role: args.role,
    today,
    locale,
    currency,
    i18n: { home, inbox, clients },
    team: teamFaces(employees),
    now: new Date(),
  };
}

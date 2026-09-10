import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildScorecard, type ListingRow, type Scorecard, type TxRow } from "./scorecard";

/**
 * The brokerage scorecard: two bounded reads (transactions and listings for
 * the whole roster, the last thirty months so the prior year is complete),
 * joined in memory so a listing's start date and list price reach the
 * transaction that closed it, then the pure build.
 */

const ROW_LIMIT = 50_000;

type TxDb = {
  id: string;
  agent_id: unknown;
  status: string | null;
  transaction_type: string | null;
  purchase_price: number | string | null;
  gross_commission: number | string | null;
  mutual_acceptance_date: string | null;
  closing_date_actual: string | null;
  closing_date: string | null;
  listing_start_date: string | null;
  terminated_reason: string | null;
  source_listing_id: string | null;
  property_address: string | null;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
};
type ListingDb = { id: string; agent_id: unknown; status: string | null; list_price: number | string | null; listing_start_date: string | null; transaction_id: string | null };

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

export async function loadScorecard(teamId: string, now = new Date()): Promise<Scorecard> {
  const { data: memberRows } = await supabaseAdmin.from("team_memberships").select("agent_id").eq("team_id", teamId).limit(3000);
  const members = ((memberRows as { agent_id: unknown }[] | null) ?? []).map((m) => String(m.agent_id));
  if (!members.length) return buildScorecard({ now, members, transactions: [], listings: [] });
  const since = new Date(now.getTime() - 30 * 31 * 86_400_000).toISOString();

  const [txRes, listRes] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("id, agent_id, status, transaction_type, purchase_price, gross_commission, mutual_acceptance_date, closing_date_actual, closing_date, listing_start_date, terminated_reason, source_listing_id, property_address, inspection_deadline, inspection_completed_at, appraisal_deadline, appraisal_completed_at, loan_contingency_deadline, loan_contingency_removed_at")
      .in("agent_id", members as never[])
      .gte("created_at", since)
      .limit(ROW_LIMIT),
    supabaseAdmin.from("listings").select("id, agent_id, status, list_price, listing_start_date, transaction_id").in("agent_id", members as never[]).gte("created_at", since).limit(ROW_LIMIT),
  ]);
  if (txRes.error) console.warn("[teams.scorecard] transactions:", txRes.error.message);
  if (listRes.error) console.warn("[teams.scorecard] listings:", listRes.error.message);

  const listingsDb = (listRes.data as ListingDb[] | null) ?? [];
  const listingById = new Map(listingsDb.map((l) => [l.id, l]));
  const listingByTx = new Map(listingsDb.filter((l) => l.transaction_id).map((l) => [l.transaction_id!, l]));

  const transactions: TxRow[] = ((txRes.data as TxDb[] | null) ?? []).map((t) => {
    const linked = (t.source_listing_id && listingById.get(t.source_listing_id)) || listingByTx.get(t.id) || null;
    return {
      id: t.id,
      agentId: String(t.agent_id),
      status: t.status ?? "",
      type: t.transaction_type,
      price: num(t.purchase_price),
      gci: num(t.gross_commission),
      acceptedOn: t.mutual_acceptance_date,
      closedOn: t.closing_date_actual,
      expectedCloseOn: t.closing_date,
      listedOn: t.listing_start_date ?? linked?.listing_start_date ?? null,
      listPrice: num(linked?.list_price ?? null),
      terminatedReason: t.terminated_reason,
      address: t.property_address,
      inspectionDue: t.inspection_deadline,
      inspectionDone: t.inspection_completed_at,
      appraisalDue: t.appraisal_deadline,
      appraisalDone: t.appraisal_completed_at,
      loanDue: t.loan_contingency_deadline,
      loanDone: t.loan_contingency_removed_at,
    };
  });
  const listings: ListingRow[] = listingsDb.map((l) => ({ id: l.id, agentId: String(l.agent_id), status: l.status ?? "", listPrice: num(l.list_price), startedOn: l.listing_start_date }));

  return buildScorecard({ now, members, transactions, listings });
}

import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTransaction } from "@/lib/transactions/service";
import type { TransactionRow } from "@/lib/transactions/types";
import type {
  ContactOfferStats,
  CounterDirection,
  FinancingType,
  OfferCounterRow,
  OfferListItem,
  OfferRow,
  OfferStatus,
} from "./types";

/**
 * Service layer for buyer-side offers.
 *
 * All writes use `supabaseAdmin` (service role) to bypass RLS. API
 * routes enforce agent ownership via agent_id match.
 *
 * Lifecycle transitions enforced here (vs in raw UPDATE calls):
 *   * submit(): draft → submitted + stamps submitted_at
 *   * addCounter(): auto-transitions status to 'countered' + updates
 *     current_price if the counter carries a new price
 *   * accept(): → accepted + stamps accepted_at. Does NOT auto-create
 *     a transaction — the agent clicks "Convert to transaction" as a
 *     separate step to review the prefilled data.
 *   * convertToTransaction(): creates a Transaction row pre-filled
 *     from the offer and back-links both directions. Only valid on
 *     accepted offers.
 */

// ── CREATE ────────────────────────────────────────────────────────────

export type CreateOfferInput = {
  agentId: string;
  contactId: string;
  propertyAddress: string;
  offerPrice: number;
  showingId?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  mlsNumber?: string | null;
  mlsUrl?: string | null;
  listPrice?: number | null;
  earnestMoney?: number | null;
  downPayment?: number | null;
  financingType?: FinancingType | null;
  closingDateProposed?: string | null;
  inspectionContingency?: boolean;
  appraisalContingency?: boolean;
  loanContingency?: boolean;
  contingencyNotes?: string | null;
  offerExpiresAt?: string | null;
  notes?: string | null;
  /** If true, create as `submitted` with submitted_at=now instead of draft. */
  submitNow?: boolean;
};

export async function createOffer(input: CreateOfferInput): Promise<OfferRow> {
  const status: OfferStatus = input.submitNow ? "submitted" : "draft";
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("offers")
    .insert({
      agent_id: input.agentId,
      contact_id: input.contactId,
      showing_id: input.showingId ?? null,
      property_address: input.propertyAddress,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      mls_number: input.mlsNumber ?? null,
      mls_url: input.mlsUrl ?? null,
      list_price: input.listPrice ?? null,
      offer_price: input.offerPrice,
      earnest_money: input.earnestMoney ?? null,
      down_payment: input.downPayment ?? null,
      financing_type: input.financingType ?? null,
      closing_date_proposed: input.closingDateProposed ?? null,
      inspection_contingency: input.inspectionContingency ?? true,
      appraisal_contingency: input.appraisalContingency ?? true,
      loan_contingency: input.loanContingency ?? true,
      contingency_notes: input.contingencyNotes ?? null,
      offer_expires_at: input.offerExpiresAt ?? null,
      notes: input.notes ?? null,
      status,
      current_price: input.offerPrice,
      submitted_at: status === "submitted" ? nowIso : null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create offer");

  // Creating an offer IS contact activity. Bump last_activity_at
  // and auto-complete any open "Follow up with inactive lead" tasks
  // — the agent is actively transacting with this contact.
  try {
    const { markContactActivity } = await import("@/lib/contacts/activity");
    await markContactActivity(input.agentId, input.contactId);
  } catch {
    // best-effort housekeeping
  }

  return data as OfferRow;
}

// ── READ ──────────────────────────────────────────────────────────────

export async function listOffersForAgent(
  agentId: string,
  opts?: { contactId?: string; status?: OfferStatus | "active" | "won" | "lost" | "all" },
): Promise<OfferListItem[]> {
  let query = supabaseAdmin
    .from("offers")
    .select("*, contacts!inner(id, name, first_name, last_name, email)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (opts?.contactId) query = query.eq("contact_id", opts.contactId);
  if (opts?.status && opts.status !== "all") {
    if (opts.status === "active") {
      query = query.in("status", ["draft", "submitted", "countered"]);
    } else if (opts.status === "won") {
      query = query.eq("status", "accepted");
    } else if (opts.status === "lost") {
      query = query.in("status", ["rejected", "withdrawn", "expired"]);
    } else {
      query = query.eq("status", opts.status);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const offerIds = (data as Array<{ id: string }>).map((r) => r.id);
  const { data: counterRows } = await supabaseAdmin
    .from("offer_counters")
    .select("offer_id")
    .in("offer_id", offerIds);
  const counterCountByOffer = new Map<string, number>();
  for (const c of (counterRows ?? []) as Array<{ offer_id: string }>) {
    counterCountByOffer.set(c.offer_id, (counterCountByOffer.get(c.offer_id) ?? 0) + 1);
  }

  return (
    data as Array<
      OfferRow & {
        contacts: {
          id: string;
          name: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        } | null;
      }
    >
  ).map((row) => {
    const c = row.contacts;
    const contactName =
      (c?.first_name || c?.last_name
        ? `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()
        : c?.name) ?? c?.email ?? null;
    const { contacts: _c, ...rest } = row as OfferRow & { contacts?: unknown };
    void _c;
    return {
      ...(rest as OfferRow),
      contact_name: contactName,
      counter_count: counterCountByOffer.get(row.id) ?? 0,
    };
  });
}

export async function getOfferWithCounters(
  agentId: string,
  id: string,
): Promise<{
  offer: OfferRow;
  counters: OfferCounterRow[];
  contactName: string | null;
} | null> {
  const { data: offerData, error } = await supabaseAdmin
    .from("offers")
    .select("*, contacts!inner(id, name, first_name, last_name, email)")
    .eq("agent_id", agentId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!offerData) return null;

  const withContact = offerData as OfferRow & {
    contacts: {
      id: string;
      name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };
  const c = withContact.contacts;
  const contactName =
    (c?.first_name || c?.last_name
      ? `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()
      : c?.name) ?? c?.email ?? null;

  const { data: counters } = await supabaseAdmin
    .from("offer_counters")
    .select("*")
    .eq("offer_id", id)
    .order("counter_number", { ascending: true });

  const { contacts: _contacts, ...rest } = withContact as OfferRow & { contacts?: unknown };
  void _contacts;

  return {
    offer: rest as OfferRow,
    counters: (counters ?? []) as OfferCounterRow[],
    contactName,
  };
}

// ── UPDATE ────────────────────────────────────────────────────────────

export type UpdateOfferInput = Partial<{
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  mls_url: string | null;
  list_price: number | null;
  offer_price: number;
  earnest_money: number | null;
  down_payment: number | null;
  financing_type: FinancingType | null;
  closing_date_proposed: string | null;
  inspection_contingency: boolean;
  appraisal_contingency: boolean;
  loan_contingency: boolean;
  contingency_notes: string | null;
  status: OfferStatus;
  current_price: number | null;
  offer_expires_at: string | null;
  notes: string | null;
}>;

export async function updateOffer(
  agentId: string,
  id: string,
  input: UpdateOfferInput,
): Promise<OfferRow | null> {
  // Snapshot to stamp lifecycle timestamps on status transitions.
  const { data: before } = await supabaseAdmin
    .from("offers")
    .select("status")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!before) return null;

  const patch: UpdateOfferInput & {
    updated_at: string;
    submitted_at?: string;
    accepted_at?: string;
    closed_at?: string;
  } = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  const beforeStatus = (before as { status: OfferStatus }).status;
  if (input.status && input.status !== beforeStatus) {
    const nowIso = new Date().toISOString();
    if (input.status === "submitted") patch.submitted_at = nowIso;
    if (input.status === "accepted") patch.accepted_at = nowIso;
    if (["rejected", "withdrawn", "expired"].includes(input.status)) {
      patch.closed_at = nowIso;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("offers")
    .update(patch)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OfferRow | null) ?? null;

  // NOTE: PR #358 used to auto-call convertOfferToTransaction here
  // when the status crossed into `accepted`. We dropped that in
  // favor of redirecting the agent to /transactions/new?offerId=<id>
  // — gives them a chance to upload the signed RPA via the existing
  // ContractUploader and tweak fields before the deal lands. The
  // back-link (offer.transaction_id) gets set when the agent
  // submits that prefilled form (see POST /api/dashboard/transactions).
}

export async function deleteOffer(agentId: string, id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from("offers")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ── Counters ──────────────────────────────────────────────────────────

export type AddCounterInput = {
  direction: CounterDirection;
  price?: number | null;
  changedFields?: Record<string, unknown> | null;
  notes?: string | null;
};

export async function addCounter(
  agentId: string,
  offerId: string,
  input: AddCounterInput,
): Promise<OfferCounterRow> {
  // Verify ownership + fetch the next counter_number.
  const { data: offerRow } = await supabaseAdmin
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!offerRow) throw new Error("Offer not found");

  const { data: existingCounters } = await supabaseAdmin
    .from("offer_counters")
    .select("counter_number")
    .eq("offer_id", offerId)
    .order("counter_number", { ascending: false })
    .limit(1);
  const nextNumber =
    (((existingCounters ?? []) as Array<{ counter_number: number }>)[0]?.counter_number ?? 0) + 1;

  const { data: counter, error } = await supabaseAdmin
    .from("offer_counters")
    .insert({
      offer_id: offerId,
      counter_number: nextNumber,
      direction: input.direction,
      price: input.price ?? null,
      changed_fields: input.changedFields ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error || !counter) throw new Error(error?.message ?? "Failed to record counter");

  // Side-effect: flip offer.status to 'countered' + update current_price.
  const statusPatch: Partial<OfferRow> & { updated_at: string } = {
    status: "countered",
    updated_at: new Date().toISOString(),
  };
  if (input.price != null) statusPatch.current_price = input.price;
  await supabaseAdmin.from("offers").update(statusPatch).eq("id", offerId);

  return counter as OfferCounterRow;
}

// ── Convert to transaction ────────────────────────────────────────────

/**
 * Creates a buyer-rep transaction from an accepted offer and back-links
 * both rows. Returns the created transaction.
 *
 * Only valid when the offer is in `accepted` status — enforced here so
 * API callers can't end-run it. Agents who click "Convert" but haven't
 * accepted yet get a clear 400 from the API route.
 */
export async function convertOfferToTransaction(
  agentId: string,
  offerId: string,
  opts?: { mutualAcceptanceDate?: string | null },
): Promise<TransactionRow> {
  const { data: offerRow, error } = await supabaseAdmin
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!offerRow) throw new Error("Offer not found");
  const offer = offerRow as OfferRow;

  if (offer.status !== "accepted") {
    throw new Error("Offer must be accepted before it can be converted to a transaction.");
  }
  if (offer.transaction_id) {
    throw new Error("This offer has already been converted to a transaction.");
  }

  const mutualAcceptance =
    opts?.mutualAcceptanceDate ??
    (offer.accepted_at ? offer.accepted_at.slice(0, 10) : null);

  const tx = await createTransaction({
    agentId,
    contactId: offer.contact_id,
    propertyAddress: offer.property_address,
    transactionType: "buyer_rep",
    city: offer.city,
    state: offer.state,
    zip: offer.zip,
    purchasePrice: offer.current_price ?? offer.offer_price,
    mutualAcceptanceDate: mutualAcceptance,
    closingDate: offer.closing_date_proposed,
    notes: offer.notes,
  });

  // Back-link offer → transaction.
  await supabaseAdmin
    .from("offers")
    .update({ transaction_id: tx.id, updated_at: new Date().toISOString() })
    .eq("id", offerId);

  return tx;
}

// ── Roll-ups ──────────────────────────────────────────────────────────

/**
 * Per-contact offer stats for the Contacts-page badge.
 *
 * Scoped by agent so the contacts page can start it before it knows which
 * contacts the Smart List will return. Pass `contactIds` to narrow the
 * result; omit it for every contact the agent has.
 */
export async function getContactOfferStats(
  agentId: string,
  contactIds?: string[],
): Promise<Map<string, ContactOfferStats>> {
  if (contactIds && contactIds.length === 0) return new Map();
  const { data: rows } = await supabaseAdmin
    .from("offers")
    .select("contact_id, status")
    .eq("agent_id", agentId);
  const offers = (rows ?? []) as Array<{ contact_id: string; status: OfferStatus }>;

  const wanted = contactIds ? new Set(contactIds) : null;
  const stats = new Map<string, ContactOfferStats>();
  for (const o of offers) {
    if (wanted && !wanted.has(o.contact_id)) continue;
    const row = stats.get(o.contact_id) ?? { total: 0, active: 0, won: 0, lost: 0 };
    row.total += 1;
    if (o.status === "draft" || o.status === "submitted" || o.status === "countered") row.active += 1;
    if (o.status === "accepted") row.won += 1;
    if (["rejected", "withdrawn", "expired"].includes(o.status)) row.lost += 1;
    stats.set(o.contact_id, row);
  }
  return stats;
}

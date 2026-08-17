import { requireRole } from "@/lib/auth/requireRole";
import { resolveAgentDisplays } from "@/lib/admin/resolveAgentDisplay";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  SellerUpdateLogClient,
  type SellerUpdateRow,
} from "./SellerUpdateLogClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Seller Updates Log | Admin | LeadSmart AI",
  description:
    "Weekly seller-update email activity derived from transactions.seller_update_last_sent_at.",
};

/**
 * Admin-only view of seller-update email send history.
 *
 * Unlike the other digests, there's no dedicated log table here —
 * send state lives inline on transactions (seller_update_enabled +
 * seller_update_last_sent_at). This page aggregates listing_rep /
 * dual transactions with the toggle on, ordered by most-recent-send.
 */
export default async function AdminSellerUpdatesPage() {
  const t = await getServerT();
  await requireRole(["admin"]);

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, agent_id, contact_id, transaction_type, property_address, status, seller_update_enabled, seller_update_last_sent_at, listing_start_date",
    )
    .in("transaction_type", ["listing_rep", "dual"])
    .eq("seller_update_enabled", true)
    .order("seller_update_last_sent_at", { ascending: false, nullsFirst: true })
    .limit(500);

  const txRows = (data ?? []) as Array<{
    id: string;
    agent_id: string | number;
    contact_id: string;
    transaction_type: string;
    property_address: string;
    status: string;
    seller_update_enabled: boolean;
    seller_update_last_sent_at: string | null;
    listing_start_date: string | null;
  }>;

  const agentIds = [...new Set(txRows.map((r) => String(r.agent_id)))];
  const contactIds = [...new Set(txRows.map((r) => r.contact_id))];
  const [agents, contactsMap] = await Promise.all([
    resolveAgentDisplays(agentIds),
    loadContactEmails(contactIds),
  ]);

  const rows: SellerUpdateRow[] = txRows.map((r) => {
    const a = agents.get(String(r.agent_id));
    const c = contactsMap.get(r.contact_id);
    return {
      transactionId: r.id,
      agentId: String(r.agent_id),
      agentEmail: a?.email ?? null,
      agentFirstName: a?.firstName ?? null,
      sellerEmail: c?.email ?? null,
      sellerName: c?.name ?? null,
      propertyAddress: r.property_address,
      transactionType: r.transaction_type,
      status: r.status,
      enabled: r.seller_update_enabled,
      lastSentAt: r.seller_update_last_sent_at,
      listingStartDate: r.listing_start_date,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <SellerUpdateLogClient rows={rows} error={error?.message ?? null} />
    </div>
  );
}

async function loadContactEmails(
  contactIds: string[],
): Promise<Map<string, { email: string | null; name: string | null }>> {
  const out = new Map<string, { email: string | null; name: string | null }>();
  if (contactIds.length === 0) return out;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, name, email")
    .in("id", contactIds);
  for (const c of (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    email: string | null;
  }>) {
    const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.name || null;
    out.set(c.id, { email: c.email, name: full });
  }
  return out;
}

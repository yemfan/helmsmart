import { requireRole } from "@/lib/auth/requireRole";
import { resolveAgentDisplays } from "@/lib/admin/resolveAgentDisplay";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  OpenHouseVisitorLogClient,
  type OpenHouseVisitorLogRow,
} from "./OpenHouseVisitorLogClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Open House Visitors | Admin | LeadSmart AI",
  description:
    "Recent open-house sign-ins across all agents. Debugging no-show alerts and follow-up delivery.",
};

/**
 * Admin-only view of recent open-house visitor sign-ins.
 *
 * Useful for debugging: "the follow-up email to a visitor never sent,
 * where's the row?" Shows the last 30 days of sign-ins across ALL
 * agents with follow-up-delivery flags (thank-you, check-in) so we
 * can eyeball whether the cron is catching them.
 */
export default async function AdminOpenHouseVisitorsPage() {
  const t = await getServerT();
  await requireRole(["admin"]);

  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("open_house_visitors")
    .select(
      "id, open_house_id, agent_id, contact_id, name, email, phone, is_buyer_agented, timeline, marketing_consent, thank_you_sent_at, check_in_sent_at, created_at",
    )
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(500);

  const visitors = (data ?? []) as Array<{
    id: string;
    open_house_id: string;
    agent_id: string | number;
    contact_id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    is_buyer_agented: boolean;
    timeline: string | null;
    marketing_consent: boolean;
    thank_you_sent_at: string | null;
    check_in_sent_at: string | null;
    created_at: string;
  }>;

  const agentIds = [...new Set(visitors.map((v) => String(v.agent_id)))];
  const ohIds = [...new Set(visitors.map((v) => v.open_house_id))];
  const [agents, openHouses] = await Promise.all([
    resolveAgentDisplays(agentIds),
    loadOpenHouses(ohIds),
  ]);

  const rows: OpenHouseVisitorLogRow[] = visitors.map((v) => {
    const a = agents.get(String(v.agent_id));
    const oh = openHouses.get(v.open_house_id);
    return {
      id: v.id,
      openHouseId: v.open_house_id,
      propertyAddress: oh?.propertyAddress ?? null,
      agentId: String(v.agent_id),
      agentEmail: a?.email ?? null,
      agentFirstName: a?.firstName ?? null,
      contactId: v.contact_id,
      visitorName: v.name,
      visitorEmail: v.email,
      visitorPhone: v.phone,
      isBuyerAgented: v.is_buyer_agented,
      timeline: v.timeline,
      marketingConsent: v.marketing_consent,
      thankYouSentAt: v.thank_you_sent_at,
      checkInSentAt: v.check_in_sent_at,
      createdAt: v.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <OpenHouseVisitorLogClient
        rows={rows}
        error={error?.message ?? null}
        cutoffIso={cutoff.slice(0, 10)}
      />
    </div>
  );
}

async function loadOpenHouses(
  ids: string[],
): Promise<Map<string, { propertyAddress: string | null }>> {
  const out = new Map<string, { propertyAddress: string | null }>();
  if (ids.length === 0) return out;
  const { data } = await supabaseAdmin
    .from("open_houses")
    .select("id, property_address")
    .in("id", ids);
  for (const r of (data ?? []) as Array<{ id: string; property_address: string | null }>) {
    out.set(r.id, { propertyAddress: r.property_address });
  }
  return out;
}

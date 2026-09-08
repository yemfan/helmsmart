import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listContacts } from "@/lib/contacts/service";
import { listSmartLists } from "@/lib/contacts/smart-lists";
import { getServerT } from "@/lib/i18n/server";
import { getContactOfferStats } from "@/lib/offers/service";
import { getContactShowingStats } from "@/lib/showings/service";
import SmartListTabs from "@/components/dashboard/SmartListTabs";
import ContactsClient from "./ContactsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("metadata.title", { ns: "web_contacts" }),
    description: t("metadata.description", { ns: "web_contacts" }),
    keywords: ["contacts", "CRM", "client management"],
    robots: { index: false },
  };
}

type PageProps = {
  searchParams: Promise<{ list?: string }>;
};

/**
 * Unified contacts hub. Smart Lists drive which subset of the contacts
 * table is shown (Leads / Sphere / All / custom). Defaults are seeded
 * per-agent by the schema migration's trigger, so every agent has the
 * three base lists on first load.
 *
 * URL param `?list=<id>` selects which list is active; omitted means
 * "use whichever default comes first by sort_order" (Leads in practice).
 */
export default async function ContactsPage({ searchParams }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { list: listParam } = await searchParams;

  // Which Smart List is active decides which contacts to read, so those two
  // are genuinely serial. The showing and offer badges depend only on the
  // agent, so they ride along with the list read instead of queueing behind
  // the contacts. Six round trips before the first byte, now three — this
  // was the slowest dashboard route to first paint (2026-09-08).
  const [smartLists, showingStats, offerStats] = await Promise.all([
    listSmartLists(agentId),
    getContactShowingStats(String(agentId)),
    getContactOfferStats(String(agentId)),
  ]);

  const visible = smartLists.filter((l) => !l.isHidden);
  const activeList =
    visible.find((l) => l.id === listParam) ?? visible[0] ?? null;

  const contacts = activeList
    ? await listContacts(agentId, activeList.filterConfig)
    : await listContacts(agentId);

  // ContactsClient still expects the legacy LeadRow shape. Adapt the
  // ContactView into that minimal shape; richer fields are available
  // if/when ContactsClient is refactored to use ContactView directly.
  const legacyRows = contacts.map((c) => {
    const stats = showingStats.get(c.id);
    const oStats = offerStats.get(c.id);
    return {
      id: c.id,
      name:
        c.fullName && c.fullName !== "(no name)"
          ? c.fullName
          : (c.email ?? null),
      email: c.email,
      phone: c.phone ?? c.phoneNumber ?? null,
      property_address: c.propertyAddress,
      source: c.source,
      rating: c.rating,
      last_contacted_at: c.lastContactedAt,
      notes: c.notes,
      created_at: c.createdAt,
      // ContactView coerces null → "en" at the service layer; collapse that
      // back to null for the legacy row so the UI can distinguish "no explicit
      // override" from "explicitly picked English". The badge renderer in
      // ContactsClient only surfaces a chip for non-English overrides.
      preferred_language: c.preferredLanguage && c.preferredLanguage !== "en" ? c.preferredLanguage : null,
      showing_total: stats?.total ?? 0,
      showing_loved: stats?.loved ?? 0,
      offer_active: oStats?.active ?? 0,
      offer_won: oStats?.won ?? 0,
    };
  });

  return (
    <div className="flex flex-col">
      <SmartListTabs lists={smartLists} activeListId={activeList?.id ?? null} />
      <ContactsClient leads={legacyRows} />
    </div>
  );
}

import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listListingsForAgent } from "@/lib/listings/service";
import ListingsClient from "./ListingsClient";

/**
 * Listings — agent-side inventory view (status, showings, offers).
 *
 * Seller presentations used to live here as a tab; they now have their
 * own "Seller Presentation" sidebar entry at /dashboard/presentations
 * (the single, consolidated generator). The old /dashboard/seller-presentation
 * route redirects there.
 *
 * URL kept as /dashboard/properties because the CommandPalette already
 * links there; sidebar entry is "Listings" under the Sales Assistant.
 */
export const metadata: Metadata = {
  title: "Listings",
  description: "Your active listings — status, showings, and offers.",
  keywords: ["listings", "inventory", "active"],
  robots: { index: false },
};

export default async function ListingsPage() {
  const { agentId } = await getCurrentAgentContext();
  const listings = await listListingsForAgent(String(agentId));

  return <ListingsClient listings={listings} />;
}

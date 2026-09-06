import { redirect } from "next/navigation";

/**
 * Retired product hub — redirects to /plans.
 *
 * It offered three doors: consumer, agent, and loan_broker. The loan-broker
 * vertical is deleted, and the other two both led to storefronts that are
 * themselves redirects to /plans now — so the page's job had become handing a
 * visitor a choice between two links to the same destination and one 404.
 */
export const dynamic = "force-dynamic";

export default function RetiredPricingHubPage() {
  redirect("/plans");
}

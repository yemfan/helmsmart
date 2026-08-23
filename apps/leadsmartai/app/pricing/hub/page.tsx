import PricingHubClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";

export const metadata = {
  title: "Choose a plan",
  description:
    "Compare PropertyToolsAI consumer pricing, CloseBoss for agents, and loan broker plans.",
};

export default async function PricingHubPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  return <PricingHubClientPage />;
}

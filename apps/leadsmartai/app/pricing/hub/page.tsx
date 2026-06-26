import PricingHubClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";

export const metadata = {
  title: "Choose a plan | RealtyBoss",
  description:
    "Compare PropertyToolsAI consumer pricing, RealtyBoss for agents, and loan broker plans.",
};

export default async function PricingHubPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  return <PricingHubClientPage />;
}

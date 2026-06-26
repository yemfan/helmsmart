import LoanBrokerPricingClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";

export const metadata = {
  title: "Loan broker plans | RealtyBoss",
  description: "Pricing for mortgage professionals — upgrade when you need full loan broker workspace tools.",
};

export default async function LoanBrokerPricingPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  return <LoanBrokerPricingClientPage />;
}

import type { Metadata } from "next";
import PricingHubClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.pricingHub.title", { ns: "web_marketing" });
  const description = t("routeMeta.pricingHub.description", { ns: "web_marketing" });
  return {
  title,
  description,
};
}

export default async function PricingHubPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  return <PricingHubClientPage />;
}

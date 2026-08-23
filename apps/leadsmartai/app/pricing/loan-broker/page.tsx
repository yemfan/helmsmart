import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.pricingLoanBroker.title", { ns: "web_marketing" });
  const description = t("routeMeta.pricingLoanBroker.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["pricing", "loan broker"],
  robots: { index: false },
};
}

export default function PricingLoanBrokerRedirectPage() {
  redirect("/loan-broker/pricing");
}

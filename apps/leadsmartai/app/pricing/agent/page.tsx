import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.pricingAgent.title", { ns: "web_marketing" });
  const description = t("routeMeta.pricingAgent.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["pricing", "agent plans"],
  robots: { index: false },
};
}

export default function PricingAgentRedirectPage() {
  redirect("/plans");
}

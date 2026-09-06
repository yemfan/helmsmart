import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.pricingConsumer.title", { ns: "web_marketing" });
  const description = t("routeMeta.pricingConsumer.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["pricing", "consumer"],
  robots: { index: false },
};
}

/** Canonical consumer pricing lives at `/pricing`. */
export default function PricingConsumerRedirectPage() {
  redirect("/plans");
}

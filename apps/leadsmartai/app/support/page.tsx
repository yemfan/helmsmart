import type { Metadata } from "next";
import CustomerSupportChat from "@/components/support/CustomerSupportChat";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.support.title", { ns: "web_marketing" });
  const description = t("routeMeta.support.description", { ns: "web_marketing" });
  return {
  title,
  description,
};
}

export default function SupportPage() {
  return <CustomerSupportChat />;
}

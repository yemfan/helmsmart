import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.hoaFeeTracker.title", { ns: "web_marketing" });
  const description = t("routeMeta.hoaFeeTracker.description", { ns: "web_marketing" });
  return {
  title,
  description,
};
}

export default function HOAFeeTrackerLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}

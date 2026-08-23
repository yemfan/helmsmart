import type { Metadata } from "next";
import SupportDashboard from "@/components/support/SupportDashboard";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.supportInbox", { ns: "dashboard" });
  return {
  title,
  description: "Manage customer support conversations.",
};
}

export default function DashboardSupportPage() {
  return <SupportDashboard />;
}

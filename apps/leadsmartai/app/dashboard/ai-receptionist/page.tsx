import type { Metadata } from "next";
import ReceptionistClient from "./ReceptionistClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.aiReceptionist", { ns: "dashboard" });
  return {
  title,
  description: "Inbound calls answered, leads captured, and missed calls recovered by your AI Receptionist.",
  robots: { index: false },
};
}

export default function AiReceptionistPage() {
  return <ReceptionistClient />;
}

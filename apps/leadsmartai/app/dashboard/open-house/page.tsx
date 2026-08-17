import { supabaseServer } from "@/lib/supabaseServer";
import OpenHouseQrList from "./OpenHouseQrList";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.openHouseQr.metaTitle", { ns: "dashboard" }),
    description: t("pages.openHouseQr.metaDescription", { ns: "dashboard" }),
    keywords: ["open house", "QR codes", "lead capture"],
    robots: { index: false },
  };
}

export default async function OpenHouseDashboardPage() {
  // Admin-style view: show QR codes for recent known properties.
  const t = await getServerT();
  const { agentId, userId } = await getCurrentAgentContext();
  const signupAgentKey = agentId || userId;

  const { data, error } = await supabaseServer
    .from("properties_warehouse")
    .select("id,address,city,state,zip_code")
    .order("last_updated", { ascending: false })
    .limit(24);

  if (error) {
    // Keep it simple (and not crash the dashboard layout).
    console.error("Failed to load properties for Open House QR codes", error);
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h1 className="text-lg font-semibold text-brand-text">{t("pages.openHouseQr.heading", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-brand-text/80">{t("pages.openHouseQr.loadFailed", { ns: "dashboard" })}</p>
      </div>
    );
  }

  return <OpenHouseQrList properties={(data ?? []) as any} agentId={signupAgentKey} />;
}


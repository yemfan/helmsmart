import { getCurrentAgentContext } from "@/lib/dashboardService";
import PresentationsClient from "@/app/dashboard/presentations/PresentationsClient";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.presentations.metaTitle", { ns: "dashboard" }),
    description: t("pages.presentations.metaDescription", { ns: "dashboard" }),
    keywords: ["presentations", "listing", "seller presentation"],
    robots: { index: false },
  };
}

export default async function PresentationsPage() {
  const ctx = await getCurrentAgentContext();

  const { data } = await supabaseServer
    .from("presentations")
    .select("id,property_address,created_at")
    .eq("agent_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <PresentationsClient initialPresentations={((data ?? []) as any) ?? []} />
  );
}


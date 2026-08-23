import type { Metadata } from "next";
import BossAssistantPage from "./boss/page";
import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { BROKER_PORTAL_ROLES } from "@/lib/rolePortalPaths";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.dashboardHome.title", { ns: "web_marketing" });
  const description = t("routeMeta.dashboardHome.description", { ns: "web_marketing" });
  return {
  title,
  description,
  robots: { index: false },
};
}

/**
 * `/dashboard` — agents land on the Boss Assistant command center;
 * brokerage roles land on the broker dashboard. The classic daily
 * overview stays available at /dashboard/overview.
 */
export default async function DashboardRootPage() {
  const supabase = supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const r = String((profile as { role?: string } | null)?.role ?? "")
      .toLowerCase()
      .trim();
    if (BROKER_PORTAL_ROLES.has(r)) {
      redirect("/dashboard/broker");
    }
  }

  return <BossAssistantPage />;
}

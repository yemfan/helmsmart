import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SettingsCard, SettingsGroupPage } from "@/components/settings/SettingsGroupPage";
import HomeValueSmartLinkCopyShare from "@/components/dashboard/HomeValueSmartLinkCopyShare";
import MlsCsvImportClient from "../MlsCsvImportClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  return {
    title: `${t("settings.groups.data.label", { ns: "dashboard" })} · ${t("pages.dashboardTitles.settings", { ns: "dashboard" })}`,
    robots: { index: false },
  };
}

/** Settings › Data & tools — links you share and imports into your CRM. */
export default async function DataSettingsPage() {
  const t = await getServerT("dashboard");
  const tr = (key: string) => t(key, { ns: "dashboard" });
  const ctx = await getCurrentAgentContext();
  const widgetAgentKey = ctx.agentId || ctx.userId;
  // Prefer the hub's home-value page: it attributes the lead to this agent.
  const { data: handleRow } = await supabaseAdmin
    .from("agents")
    .select("username")
    .eq("id", ctx.agentId as never)
    .maybeSingle();
  const handle = (handleRow as { username?: string | null } | null)?.username ?? null;
  const smartLinkPath = handle ? `/@${handle}/home-value` : `/home-value-widget?agentId=${encodeURIComponent(widgetAgentKey)}`;

  return (
    <SettingsGroupPage
      title={tr("settings.groups.data.label")}
      description={tr("settings.groups.data.description")}
      back={tr("settings.index.back")}
    >
      <SettingsCard title={tr("settings.smartLink")} description={tr("settings.smartLinkHelp")}>
        <HomeValueSmartLinkCopyShare
          showUrl
          relativePath={smartLinkPath}
        />
      </SettingsCard>

      <SettingsCard title={tr("settings.mlsImport")}>
        <MlsCsvImportClient />
      </SettingsCard>
    </SettingsGroupPage>
  );
}

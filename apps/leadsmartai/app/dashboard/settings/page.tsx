import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { SettingsIndex } from "@/components/settings/SettingsIndex";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  const title = t("pages.dashboardTitles.settings", { ns: "dashboard" });
  return {
    title,
    description: "Configure your account, AI team, channels, messaging and data.",
    robots: { index: false },
  };
}

/**
 * Settings index. The groups themselves are pages under this route
 * (account, ai-team, channels, messaging, data) — see lib/settings/groups.ts.
 * Legacy `?tab=` / `#hash` links are forwarded client-side by SettingsIndex.
 */
export default function SettingsPage() {
  return <SettingsIndex />;
}

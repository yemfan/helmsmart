import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { SettingsCard, SettingsGroupPage } from "@/components/settings/SettingsGroupPage";
import ProfileSettingsForm from "@/components/account/ProfileSettingsForm";
import BrandingSettingsPanel from "@/components/dashboard/BrandingSettingsPanel";
import DigitalTwinPanel from "@/components/account/DigitalTwinPanel";
import LanguagePanel from "@/components/dashboard/LanguagePanel";
import AccountTimezonePanel from "@/components/dashboard/AccountTimezonePanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  return {
    title: `${t("settings.groups.account.label", { ns: "dashboard" })} · ${t("pages.dashboardTitles.settings", { ns: "dashboard" })}`,
    robots: { index: false },
  };
}

/** Settings › Account — who you are: profile, brand, digital twin, language, plan. */
export default async function AccountSettingsPage() {
  const t = await getServerT("dashboard");
  const tr = (key: string) => t(key, { ns: "dashboard" });

  return (
    <SettingsGroupPage
      title={tr("settings.groups.account.label")}
      description={tr("settings.groups.account.description")}
      back={tr("settings.index.back")}
    >
      <ProfileSettingsForm />

      <SettingsCard title={tr("profile.branding")} description={tr("profile.brandingSubtitle")}>
        <BrandingSettingsPanel />
      </SettingsCard>

      <DigitalTwinPanel />

      <LanguagePanel />

      {/* One timezone for briefings, the overnight run and the receptionist (#1554). */}
      <AccountTimezonePanel />

      <SettingsCard title={tr("settings.index.planTitle")} description={tr("settings.index.planBody")}>
        <Link
          href="/dashboard/credits"
          className="inline-flex rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >
          {tr("settings.index.planCta")}
        </Link>
      </SettingsCard>
    </SettingsGroupPage>
  );
}

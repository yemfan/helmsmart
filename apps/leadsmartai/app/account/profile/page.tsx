import Link from "next/link";
import ProfileSettingsForm from "@/components/account/ProfileSettingsForm";
import BrandingSettingsPanel from "@/components/dashboard/BrandingSettingsPanel";
import DigitalTwinPanel from "@/components/account/DigitalTwinPanel";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "My Profile | CloseBoss",
  description: "Update your name, phone, profile photo, and branding.",
};

export default async function AccountProfilePage() {
  const t = await getServerT();
  const tr = (key: string) => t(key, { ns: "dashboard" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{tr("profile.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{tr("profile.subtitle")}</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          {tr("profile.backToDashboard")}
        </Link>
      </div>

      <div className="space-y-4">
        <ProfileSettingsForm />

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">{tr("profile.branding")}</h2>
          <p className="mt-0.5 text-xs text-gray-500 mb-4">{tr("profile.brandingSubtitle")}</p>
          <BrandingSettingsPanel />
        </div>

        <DigitalTwinPanel />
      </div>
    </div>
  );
}

"use client";

import { useTranslation } from "react-i18next";

export default function BrokerSettingsPage() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("pages.loanBroker.settings", { ns: "dashboard" })}</h1>
        <p className="text-sm text-gray-500">{t("pages.loanBroker.settingsSub", { ns: "dashboard" })}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">{t("pages.loanBroker.settingsSoon", { ns: "dashboard" })}</p>
      </div>
    </div>
  );
}

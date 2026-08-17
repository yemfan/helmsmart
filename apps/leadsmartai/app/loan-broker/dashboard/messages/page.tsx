"use client";

import { useTranslation } from "react-i18next";

export default function BrokerMessagesPage() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("pages.loanBroker.messages", { ns: "dashboard" })}</h1>
        <p className="text-sm text-gray-500">{t("pages.loanBroker.messagesSub", { ns: "dashboard" })}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm text-center">
        <div className="text-3xl mb-3">💬</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{t("pages.loanBroker.comingSoon", { ns: "dashboard" })}</h3>
        <p className="text-sm text-gray-500">{t("pages.loanBroker.messagesSoon", { ns: "dashboard" })}</p>
      </div>
    </div>
  );
}

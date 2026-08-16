"use client";

import { useTranslation } from "react-i18next";

export function GreetingAutomationSettingsPanel() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.greetingAutomation.heading")}</h2>
      </div>
      <ul className="list-disc space-y-2 p-5 pl-8 text-sm text-slate-700">
        <li>{t("pages.greetingAutomation.triggers")}</li>
        <li>{t("pages.greetingAutomation.checkIn")}</li>
        <li>{t("pages.greetingAutomation.channel")}</li>
        <li>{t("pages.greetingAutomation.dailyJob")}<code className="text-xs bg-slate-100 px-1 rounded">GET /api/jobs/greetings/run?token=CRON_SECRET</code></li>
        <li>{t("pages.greetingAutomation.settingsTable")}<code className="text-xs bg-slate-100 px-1 rounded">greeting_automation_settings</code> (defaults apply if no row).</li>
      </ul>
    </section>
  );
}

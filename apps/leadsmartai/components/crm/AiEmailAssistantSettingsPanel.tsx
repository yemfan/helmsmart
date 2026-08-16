"use client";

import { useTranslation } from "react-i18next";

export function AiEmailAssistantSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const bullets = ["inbound", "outbound", "draftOnly", "notify"] as const;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.aiEmailPanel.heading")}</h2>
      </div>
      <ul className="list-disc space-y-2 p-5 pl-8 text-sm text-slate-700 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-xs">
        {bullets.map((k) => (
          <li
            key={k}
            dangerouslySetInnerHTML={{ __html: t(`pages.aiEmailPanel.${k}`) }}
          />
        ))}
      </ul>
    </section>
  );
}

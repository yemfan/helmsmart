import { getServerT } from "@/lib/i18n/server";

const ITEMS = [
  { label: "pages.compliance.stopLabel", description: "pages.compliance.stopDesc" },
  { label: "pages.compliance.firstSmsLabel", description: "pages.compliance.firstSmsDesc" },
  { label: "pages.compliance.agentOfRecordLabel", description: "pages.compliance.agentOfRecordDesc", source: "pages.compliance.source28" },
  { label: "pages.compliance.avmLabel", description: "pages.compliance.avmDesc", source: "pages.compliance.source28Legal" },
  { label: "pages.compliance.draftWindowLabel", description: "pages.compliance.draftWindowDesc", source: "pages.compliance.source24" },
  { label: "pages.compliance.anniversaryLabel", description: "pages.compliance.anniversaryDesc", source: "pages.compliance.source28" },
];

export default async function ComplianceCard() {
  const t = await getServerT();
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.compliance.title", { ns: "dashboard" })}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t("pages.compliance.sub", { ns: "dashboard" })}</p>

      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {ITEMS.map((item) => (
          <div key={item.label} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(item.label, { ns: "dashboard" })}</div>
              <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">{t("pages.compliance.alwaysOn", { ns: "dashboard" })}</span>
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t(item.description, { ns: "dashboard" })}</div>
            {item.source && (
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{t(item.source, { ns: "dashboard" })}</div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-slate-500">
        <strong className="font-semibold text-slate-700 dark:text-slate-300">{t("pages.compliance.legalNoticeLabel", { ns: "dashboard" })}</strong>{" "}
        {t("pages.compliance.legalNotice", { ns: "dashboard" })}</p>
    </div>
  );
}

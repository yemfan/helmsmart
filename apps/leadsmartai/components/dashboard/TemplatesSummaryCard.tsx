import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { getTemplateSummaryForAgent } from "@/lib/agent-messaging/template-summary";

export default async function TemplatesSummaryCard({ agentId }: { agentId: string }) {
  const t = await getServerT("dashboard");
  const serverT = await getServerT();
  // Named `tr` — template rows below bind `t` in their .map().
  const tr = (key: string) => serverT(key, { ns: "dashboard" });
  const summary = await getTemplateSummaryForAgent(agentId, 8);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{tr("settings.templates.heading")}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t("pages.templatesSummary.intro", { ns: "dashboard" })}</p>

      {summary.fallback ? (
        <div className="mt-4 rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("pages.templatesSummary.notSeeded", { ns: "dashboard" })}</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatBox n={summary.total} label={tr("settings.templates.inLibrary")} />
            <StatBox n={summary.autosend} label={tr("settings.templates.autosend")} tone="accent" />
            <StatBox n={summary.review} label={tr("settings.templates.reviewFirst")} tone="muted" />
            <StatBox n={summary.off} label={t("pages.labels.off", { ns: "dashboard" })} tone="muted" />
          </div>

          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <span>ID</span>
              <span>{tr("settings.templates.columns.template")}</span>
              <span>{tr("settings.templates.columns.channel")}</span>
              <span>{tr("settings.templates.columns.langs")}</span>
              <span>{tr("settings.templates.columns.status")}</span>
            </div>
            {summary.rows.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-xs"
              >
                <span className="font-mono text-[11px] text-slate-500">{t.id}</span>
                <span className="min-w-0 truncate text-slate-800">{t.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    t.channel === "sms"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-violet-50 text-violet-700"
                  }`}
                >
                  {t.channel}
                </span>
                <span className="flex gap-1">
                  {t.languages.map((l) => (
                    <span
                      key={l}
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600"
                    >
                      {l}
                    </span>
                  ))}
                </span>
                <StatusBadge
                  status={t.status}
                  label={tr(`settings.templates.${t.status === "autosend" ? "autosend" : t.status === "review" ? "review" : "off"}`)}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            <strong className="font-semibold text-slate-700">{tr("settings.templates.bilingualLabel")}</strong>{" "}
            {Math.round(summary.bilingualCoverageFraction * 100)}% of templates have both English and Chinese
            variants. Templates with English only will fall back to English even if the contact&apos;s preferred
            language is Chinese.
          </div>
        </>
      )}

      <div className="mt-4">
        <Link
          href="/dashboard/templates"
          className="inline-flex text-sm font-medium text-brand-accent-text hover:underline"
        >
          {t("pages.templatesSummary.openLibrary", { ns: "dashboard" })}
        </Link>
      </div>
    </div>
  );
}

function StatBox({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone?: "accent" | "muted";
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center ${
        tone === "accent"
          ? "border-brand-accent/30 bg-brand-accent/5"
          : tone === "muted"
            ? "border-slate-200 bg-slate-50"
            : "border-slate-200"
      }`}
    >
      <div className="text-lg font-semibold text-slate-900 tabular-nums">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: "autosend" | "review" | "off"; label: string }) {
  const cls =
    status === "autosend"
      ? "bg-green-50 text-green-700"
      : status === "review"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";
  // Label is resolved by the caller (server component owns `t`).
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
  );
}

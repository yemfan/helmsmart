import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import { DEMO_DRAFTS } from "@/lib/demo/data";
import { localizeDraft } from "@/lib/demo/localize";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.demoPages.metaDraftsTitle", { ns: "dashboard" }),
    description: t("pages.demoPages.metaDraftsDescription", { ns: "dashboard" }),
    alternates: { canonical: "/demo/drafts" },
    robots: { index: false, follow: true },
  };
}

export default async function DemoDrafts() {
  const t = await getServerT();
  const agoLabel = (min: number) =>
    min < 60
      ? t("pages.demoPages.agoMinutes", { ns: "dashboard", n: min })
      : t("pages.demoPages.agoHours", { ns: "dashboard", n: Math.floor(min / 60) });
  return (
    <DemoShell active="/demo/drafts">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("pages.demoPages.aiDrafts", { ns: "dashboard" })}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("pages.demoPages.draftsCount", {
              ns: "dashboard",
              n: DEMO_DRAFTS.length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoDisabledButton label={t("pages.demoPages.switchAuto", { ns: "dashboard" })} variant="ghost" />
          <DemoDisabledButton label={t("pages.demoPages.approveAll", { ns: "dashboard" })} />
        </div>
      </header>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
        <div className="flex items-start gap-2 text-xs leading-5 text-blue-900 dark:text-blue-100">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{t("pages.demoPages.whyHere", { ns: "dashboard" })}</span>{" "}{t("pages.dashFragments.youreOn", { ns: "dashboard" })}{" "}
            <span className="font-semibold">{t("pages.demoPages.requireApproval", { ns: "dashboard" })}</span>{" "}{t("pages.dashFragments.policySoDrafts", { ns: "dashboard" })}{" "}
            <span className="font-semibold">{t("pages.demoPages.autoSend", { ns: "dashboard" })}</span>{t("pages.demoPages.autoSendHint", { ns: "dashboard" })}</p>
        </div>
      </section>

      <ul className="mt-5 space-y-4">
        {DEMO_DRAFTS.map(localizeDraft.bind(null, t)).map((draft) => (
          <li
            key={draft.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {draft.contactName}
                </h3>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {draft.channel === "sms" ? "SMS" : t("pages.drafts.email", { ns: "dashboard" })} ·{" "}
                  {t("pages.demoPages.draftedAgo", {
                    ns: "dashboard",
                    ago: agoLabel(draft.ago),
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                <Sparkles className="h-2.5 w-2.5" aria-hidden />{t("pages.demoPages.aiDraft", { ns: "dashboard" })}</span>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.aiReasoning", { ns: "dashboard" })}</p>
              <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
                {draft.reasoning}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.draft", { ns: "dashboard" })}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800 dark:text-slate-100">
                {draft.draft}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <DemoDisabledButton label={t("pages.demoPages.approveSend", { ns: "dashboard" })} />
              <DemoDisabledButton label={t("pages.demoPages.editSend", { ns: "dashboard" })} variant="ghost" />
              <DemoDisabledButton label={t("pages.demoPages.discard", { ns: "dashboard" })} variant="ghost" />
              <DemoDisabledButton label={t("pages.demoPages.alwaysEscalate", { ns: "dashboard" })} variant="ghost" />
            </div>
          </li>
        ))}
      </ul>
    </DemoShell>
  );
}

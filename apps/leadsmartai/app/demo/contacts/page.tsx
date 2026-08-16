import type { Metadata } from "next";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import { DEMO_CONTACTS, type DemoLeadScore } from "@/lib/demo/data";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Demo workspace · Contacts",
  description:
    "Browse a sample CloseBoss contacts list — 50 contacts with AI lead scoring, lifecycle stage, source attribution, and last-activity context.",
  alternates: { canonical: "/demo/contacts" },
  robots: { index: false, follow: true },
};

const STAGE_LABEL: Record<string, { label: string; className: string }> = {
  lead: {
    label: "Lead",
    className:
      "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  },
  nurture: {
    label: "Nurture",
    className:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  },
  appointment: {
    label: "Appointment",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  active_client: {
    label: "Active client",
    className:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  },
  past_client: {
    label: "Past client",
    className:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

export default async function DemoContacts() {
  const t = await getServerT();
  const total = DEMO_CONTACTS.length;
  const hot = DEMO_CONTACTS.filter((c) => c.score === "A").length;
  const escalated = DEMO_CONTACTS.filter((c) =>
    /Escalated/i.test(c.tag ?? ""),
  ).length;

  return (
    <DemoShell active="/demo/contacts">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("pages.demoPages.contacts", { ns: "dashboard" })}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} total · {hot} hot · {escalated} {t("pages.dashFragments.escalatedToYou", { ns: "dashboard" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoDisabledButton label={t("pages.demoPages.importCsv", { ns: "dashboard" })} variant="ghost" />
          <DemoDisabledButton label={t("pages.demoPages.newContact", { ns: "dashboard" })} />
        </div>
      </header>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip label={t("pages.demoPages.all", { ns: "dashboard" })} count={total} active />
        <Chip label={t("pages.demoPages.hotA", { ns: "dashboard" })} count={hot} />
        <Chip
          label={t("pages.demoPages.fromZillow", { ns: "dashboard" })}
          count={DEMO_CONTACTS.filter((c) => c.source === "Zillow").length}
        />
        <Chip
          label={t("pages.demoPages.openHouse", { ns: "dashboard" })}
          count={DEMO_CONTACTS.filter((c) => c.source === "Open House").length}
        />
        <Chip
          label="Sphere · past client"
          count={
            DEMO_CONTACTS.filter((c) => c.stage === "past_client").length
          }
        />
        <Chip
          label={t("pages.demoPages.escalated", { ns: "dashboard" })}
          count={escalated}
          tone="red"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">{t("pages.demoPages.colName", { ns: "dashboard" })}</th>
              <th className="px-4 py-3">{t("pages.demoPages.colStage", { ns: "dashboard" })}</th>
              <th className="px-4 py-3">{t("pages.demoPages.colScore", { ns: "dashboard" })}</th>
              <th className="px-4 py-3">{t("pages.demoPages.colSource", { ns: "dashboard" })}</th>
              <th className="px-4 py-3">{t("pages.demoPages.colLastActivity", { ns: "dashboard" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {DEMO_CONTACTS.map((c) => (
              <tr
                key={c.id}
                className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {c.city}
                    {c.interest ? ` · ${c.interest}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STAGE_LABEL[c.stage].className}`}
                  >
                    {STAGE_LABEL[c.stage].label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={c.score} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  {c.source}
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">
                    {c.lastActivity}
                  </p>
                  {c.tag ? (
                    <p className="mt-1 inline-flex rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                      {c.tag}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoShell>
  );
}

function Chip({
  label,
  count,
  active,
  tone = "default",
}: {
  label: string;
  count: number;
  active?: boolean;
  tone?: "default" | "red";
}) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
        {label}{" "}
        <span className="rounded-full bg-blue-700 px-1.5 py-0.5 text-[9px]">
          {count}
        </span>
      </span>
    );
  }
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
      : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      {label}
      <span className="text-[9px] text-slate-500 dark:text-slate-400">
        {count}
      </span>
    </span>
  );
}

function ScoreBadge({ score }: { score: DemoLeadScore }) {
  const palette: Record<DemoLeadScore, string> = {
    A: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    B: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    C: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${palette[score]}`}
    >
      {score}
    </span>
  );
}

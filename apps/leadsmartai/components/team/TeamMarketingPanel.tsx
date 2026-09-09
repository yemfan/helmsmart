"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { autopilotIsOn, type Attention, type MarketingRow, type TeamMarketing } from "@/lib/teams/marketing";
import { downloadCsv, toCsv } from "@/lib/teams/csv";
import { nudgeAgents } from "@/app/dashboard/team/actions";

/**
 * Marketing across the team on /dashboard/team, for the owner and managers:
 * how many agents are set up (hub live, networks connected, tracking on,
 * assistant posting on its own), what the setup produced in the window, the
 * reasons some agents need a word, and one row per agent with all of it.
 *
 * Attention reasons are the point of the panel. A broker with 1,200 agents
 * does not read 1,200 rows; they read "184 have no hub yet" and act on it.
 */

const WINDOWS = [7, 30, 90] as const;

/** Brand names, which do not translate. */
const NETWORK: Record<string, string> = {
  meta: "Facebook · Instagram",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  google: "Google",
  x: "X",
};

/** Product names, which do not translate either. */
const TRACKER = { ga: "GA4", pixel: "Meta Pixel" };

const ATTENTION_TONE: Record<Attention, string> = {
  no_hub: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  no_network: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  no_tracking: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  failing: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  silent: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

/**
 * One click emails everyone in the selected bucket. The label carries the
 * outcome; the small text after it says who was skipped and why.
 */
function NudgeButton({ teamId, reason, count }: { teamId: string; reason: Attention; count: number }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamMarketing.${s}`, vars);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sent: number; failed: number; skippedRecent: number; noEmail: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || result !== null || count === 0}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const fd = new FormData();
            fd.set("teamId", teamId);
            fd.set("reason", reason);
            const r = await nudgeAgents(fd);
            if (r.ok) setResult({ sent: r.sent, failed: r.failed, skippedRecent: r.skippedRecent, noEmail: r.noEmail });
            else setError(r.error);
          })
        }
        className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {result ? k("nudged", { count: result.sent }) : pending ? k("nudging") : k("nudge", { count })}
      </button>
      {result && (result.skippedRecent > 0 || result.noEmail > 0 || result.failed > 0) ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {[
            result.skippedRecent > 0 ? k("nudgeSkipped", { count: result.skippedRecent }) : null,
            result.noEmail > 0 ? k("nudgeNoEmail", { count: result.noEmail }) : null,
            result.failed > 0 ? k("nudgeFailed", { count: result.failed }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
      {error ? (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function TeamMarketingPanel({ teamId }: { teamId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamMarketing.${s}`, vars);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [data, setData] = useState<TeamMarketing | null>(null);
  const [failed, setFailed] = useState(false);
  const [only, setOnly] = useState<Attention | null>(null);
  // Dates are the browser's, not the server's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/team/${teamId}/marketing?days=${days}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; marketing?: TeamMarketing }) => {
        if (cancelled) return;
        if (j.ok && j.marketing) setData(j.marketing);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [teamId, days]);

  const num = (n: number) => n.toLocaleString(locale);
  const date = (iso: string | null) => (iso && mounted ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const rows = data ? (only ? data.rows.filter((r) => r.attention.includes(only)) : data.rows) : [];
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
  const numTd = `${td} text-right tabular-nums`;
  const chip = (active: boolean) =>
    `inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`;
  const yes = <span className="text-emerald-700 dark:text-emerald-400">✓</span>;
  const no = <span className="text-slate-400">—</span>;

  const exportCsv = () => {
    if (!data) return;
    const header = [t("pages.teamPerformance.agent"), "email", "role", k("col.hub"), k("col.networks"), TRACKER.ga, TRACKER.pixel, k("col.assistant"), k("col.posts"), k("failedCount", { count: "" }).trim(), k("col.queued"), k("col.hubViews"), k("col.hubLeads"), k("col.lastPost"), k("col.attention")];
    const body = data.rows.map((r) => [
      r.name ?? "",
      r.email ?? "",
      r.role,
      r.hubPublished ? (r.username ? `/a/${r.username}` : "yes") : "",
      r.networks.map((n) => NETWORK[n] ?? n).join("; "),
      r.gaConfigured,
      r.pixelConfigured,
      autopilotIsOn(r.autopilotMode) ? k("assistantOn") : k("assistantOff"),
      r.postsPublished,
      r.postsFailed,
      r.scheduledUpcoming,
      r.hubViews,
      r.hubLeads,
      r.lastPostAt ?? "",
      r.attention.map((a) => k(`attention.${a}`)).join("; "),
    ]);
    downloadCsv(`team-marketing-${days}d.csv`, toCsv(header, body));
  };

  const setup: { key: string; value: number }[] = data
    ? [
        { key: "hubPublished", value: data.summary.hubPublished },
        { key: "withNetwork", value: data.summary.withNetwork },
        { key: "withTracking", value: data.summary.withTracking },
        { key: "autopilotOn", value: data.summary.autopilotOn },
        { key: "posting", value: data.summary.posting },
      ]
    : [];
  const output: { key: string; value: number }[] = data
    ? [
        { key: "postsPublished", value: data.summary.postsPublished },
        { key: "scheduledUpcoming", value: data.summary.scheduledUpcoming },
        { key: "hubViews", value: data.summary.hubViews },
        { key: "hubLeads", value: data.summary.hubLeads },
      ]
    : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label={k("window")}>
          {WINDOWS.map((w) => (
            <button key={w} type="button" role="tab" aria-selected={days === w} className={chip(days === w)} onClick={() => setDays(w)}>
              {t(`pages.teamPerformance.days.${w}`)}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{k("loadFailed")}</p>
      ) : !data ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      ) : data.summary.agents === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("pages.teamPerformance.empty")}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {setup.map(({ key, value }) => (
              <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k(`setup.${key}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {num(value)}
                  <span className="text-sm font-normal text-slate-500"> / {num(data.summary.agents)}</span>
                </dd>
              </div>
            ))}
          </dl>
          <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {output.map(({ key, value }) => (
              <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k(`output.${key}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{num(value)}</dd>
              </div>
            ))}
          </dl>

          {data.attention.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={k("attentionTitle")}>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k("attentionTitle")}</span>
              {data.attention.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={only === a.key}
                  onClick={() => setOnly(only === a.key ? null : a.key)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition ${ATTENTION_TONE[a.key]} ${only === a.key ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100" : ""}`}
                >
                  <span className="tabular-nums font-semibold">{num(a.count)}</span>
                  {k(`attention.${a.key}`)}
                </button>
              ))}
              {only ? (
                <>
                  <button type="button" onClick={() => setOnly(null)} className="text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                    {k("showAll")}
                  </button>
                  <NudgeButton key={only} teamId={teamId} reason={only} count={rows.length} />
                </>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">{k("allGood")}</p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[64rem]">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className={th}>{t("pages.teamPerformance.agent")}</th>
                  <th className={th}>{k("col.hub")}</th>
                  <th className={th}>{k("col.networks")}</th>
                  <th className={`${th} hidden md:table-cell`}>{k("col.tracking")}</th>
                  <th className={`${th} hidden lg:table-cell`}>{k("col.assistant")}</th>
                  <th className={`${th} text-right`}>{k("col.posts")}</th>
                  <th className={`${th} text-right hidden md:table-cell`}>{k("col.queued")}</th>
                  <th className={`${th} text-right hidden lg:table-cell`}>{k("col.hubViews")}</th>
                  <th className={`${th} text-right hidden lg:table-cell`}>{k("col.hubLeads")}</th>
                  <th className={`${th} hidden xl:table-cell`}>{k("col.lastPost")}</th>
                  <th className={th}>{k("col.attention")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r: MarketingRow) => (
                  <tr key={r.agentId}>
                    <td className={td}>
                      <span className="font-medium">{r.name ?? r.email ?? r.agentId}</span>
                      {r.role === "owner" ? <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">{t("pages.team.owner")}</span> : null}
                    </td>
                    <td className={td}>
                      {r.hubPublished && r.username ? (
                        <a href={`/a/${r.username}`} target="_blank" rel="noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                          @{r.username}
                        </a>
                      ) : r.hubPublished ? (
                        yes
                      ) : (
                        <span className="text-slate-500">{k("hubNotLive")}</span>
                      )}
                    </td>
                    <td className={td}>
                      {r.networks.length === 0 ? (
                        no
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {r.networks.map((n) => (
                            <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {NETWORK[n] ?? n}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className={`${td} hidden md:table-cell`}>
                      {!r.hubPublished ? (
                        no
                      ) : (
                        <span className="flex gap-2 text-xs">
                          <span className={r.gaConfigured ? "" : "text-slate-400"}>{r.gaConfigured ? "✓" : "—"} {TRACKER.ga}</span>
                          <span className={r.pixelConfigured ? "" : "text-slate-400"}>{r.pixelConfigured ? "✓" : "—"} {TRACKER.pixel}</span>
                        </span>
                      )}
                    </td>
                    <td className={`${td} hidden lg:table-cell`}>{autopilotIsOn(r.autopilotMode) ? k("assistantOn") : k("assistantOff")}</td>
                    <td className={numTd}>
                      {num(r.postsPublished)}
                      {r.postsFailed > 0 ? <span className="ml-1 text-xs text-rose-700 dark:text-rose-400">{k("failedCount", { count: r.postsFailed })}</span> : null}
                    </td>
                    <td className={`${numTd} hidden md:table-cell`}>{num(r.scheduledUpcoming)}</td>
                    <td className={`${numTd} hidden lg:table-cell`}>{num(r.hubViews)}</td>
                    <td className={`${numTd} hidden lg:table-cell`}>{num(r.hubLeads)}</td>
                    <td className={`${td} hidden xl:table-cell text-slate-500`}>{r.lastPostAt ? date(r.lastPostAt) : no}</td>
                    <td className={td}>
                      {r.attention.length === 0 ? (
                        yes
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {r.attention.map((a) => (
                            <span key={a} className={`rounded-full px-2 py-0.5 text-xs ring-1 ${ATTENTION_TONE[a]}`}>
                              {k(`attention.${a}`)}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {only && rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">{k("noneMatch")}</p> : null}
          <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
            <button type="button" onClick={exportCsv} className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300">
              {k("exportCsv")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildStory,
  buildTimeline,
  fmtAgo,
  type LeadProfilePayload,
} from "@/lib/closeboss/leadProfile";
import { SendMarketReportButton } from "@/components/marketReport/SendMarketReportButton";
import { AutoPilotToggle } from "@/components/crm/AutoPilotToggle";

/**
 * Full-page person profile. Layout answers, in order: who is this
 * person, what should I do next, what do I know, what has the team
 * done with them. Relationship first; the raw CRM record stays one
 * click away in the contacts hub.
 */
export default function LeadProfileClient({ leadId }: { leadId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [data, setData] = useState<LeadProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard/closeboss/lead/${leadId}?full=1`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData(j as LeadProfilePayload);
        else setError(j?.error ?? t("detail.leadProfile.loadFailed"));
      })
      .catch(() => !cancelled && setError(t("detail.leadProfile.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const timeline = useMemo(() => (data ? buildTimeline(data, 30) : []), [data]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        <Link href="/dashboard/contacts" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-800">
          {t("pages.leadProfile.backToLeads")}
        </Link>
      </div>
    );
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-slate-400">{t("pages.leadProfile.gettingFullPicture")}</p>;
  }

  const p = data.person;
  const story = buildStory(p);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* ── Who they are ── */}
      <header className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm">
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/contacts" className="hover:underline">{t("detail.leadProfile.breadcrumb")}</Link>
          {" / "}
          <span>{p.name ?? t("detail.leadProfile.lead")}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{p.name ?? t("detail.leadProfile.unnamed")}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {[p.source, `with you since ${new Date(p.created_at).toLocaleDateString(locale, { month: "long", day: "numeric" })}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {p.rating && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.rating === "hot" ? "bg-red-100 text-red-700" : p.rating === "warm" ? "bg-amber-100 text-amber-700" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                {p.rating}{typeof p.engagement_score === "number" ? ` · ${p.engagement_score}` : ""}
              </span>
            )}
            {p.phone && <AutoPilotToggle contactId={p.id} initial={Boolean(p.auto_pilot)} size="sm" />}
          </div>
        </div>
        {(p.intent || story) && <p className="mt-3 text-base text-slate-800 dark:text-slate-200">{p.intent ?? story}</p>}
        {p.intent && story && <p className="mt-0.5 text-sm text-slate-500">{story}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.phone && (
            <a href={`tel:${p.phone}`} className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">{t("pages.dashFragments.call")} {p.first_name ?? ""}
            </a>
          )}
          {p.phone && (
            <Link href={`/dashboard/inbox?lead=${encodeURIComponent(p.id)}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{t("pages.leadProfile.text")}</Link>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{t("pages.leadProfile.email")}</a>
          )}
          <SendMarketReportButton
            contactId={p.id}
            firstName={p.first_name}
            email={p.email}
            phone={p.phone}
            city={p.search_location}
          />
          <Link href="/dashboard/inbox" className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{t("pages.leadProfile.conversations")}</Link>
          <Link
            href={`/dashboard/contacts?list=leads&highlight=${encodeURIComponent(p.id)}`}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{t("pages.leadProfile.fullRecord")}</Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── Left: act + know ── */}
        <div className="space-y-4 lg:col-span-2">
          {data.nextBestAction && (
            <section className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a0e]">{t("detail.leadProfile.nextBestAction")}</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{data.nextBestAction.title}</p>
              {data.nextBestAction.reason && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{data.nextBestAction.reason}</p>}
              {data.nextBestAction.expected_outcome && (
                <p className="mt-1 text-xs font-medium text-[#8a6a0e]">→ {data.nextBestAction.expected_outcome}</p>
              )}
            </section>
          )}

          {p.notes && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("detail.leadProfile.whatYouKnow")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{p.notes}</p>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("detail.leadProfile.openFollowUps")}</p>
            {data.tasks.length === 0 ? (
              <p className="mt-1.5 text-sm text-slate-400">{t("pages.leadProfile.nothingOpen")}</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="min-w-0 truncate">☐ {t.title}</span>
                    {t.due_at && (
                      <span className={`shrink-0 text-xs ${new Date(t.due_at).getTime() < Date.now() ? "font-medium text-red-600" : "text-slate-400"}`}>
                        {new Date(t.due_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.appointments.length > 0 && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("detail.leadProfile.upcoming")}</p>
              <ul className="mt-1.5 space-y-1.5">
                {data.appointments.map((e) => (
                  <li key={e.id} className="text-sm text-slate-700 dark:text-slate-300">
                    📅 {e.title}
                    <span className="block text-xs text-slate-400">
                      {new Date(e.starts_at).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Right: the relationship so far ── */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm lg:col-span-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("detail.leadProfile.storySoFar")}</p>
          {timeline.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">{t("pages.leadProfile.noInteractions")}</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {timeline.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span className="mt-0.5 text-base" aria-hidden>{item.icon}</span>
                  <div className="min-w-0 border-b border-slate-50 pb-3">
                    <p className="text-sm text-slate-800 dark:text-slate-200">{item.title}</p>
                    {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">{fmtAgo(item.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

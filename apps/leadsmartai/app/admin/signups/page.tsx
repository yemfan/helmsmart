import { requireRole } from "@/lib/auth/requireRole";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  summarizeSignupSources,
  type SignupRow,
} from "@/lib/admin/signupSources";
import type { Metadata } from "next";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Signups by Source | LeadSmart AI",
  description: "Where new agent signups come from.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export default async function AdminSignupsPage() {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  await requireRole(["admin"]);

  const { data } = await supabaseServer
    .from("agents")
    .select("signup_attribution, created_at, plan_type, brand_name")
    .order("created_at", { ascending: false })
    .limit(5000);

  const summary = summarizeSignupSources((data ?? []) as SignupRow[]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t("pages.adminSignups.eyebrow", { ns: "dashboard" })}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{t("pages.adminPages.signupsBySource", { ns: "dashboard" })}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("pages.adminPages.signupsIntro", { ns: "dashboard" })}
        </p>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total signups", value: summary.total },
          { label: "Attributed", value: summary.tracked, sub: pct(summary.tracked, summary.total) },
          { label: "Unknown", value: summary.untracked, sub: pct(summary.untracked, summary.total) },
          { label: "Paid", value: summary.paid, sub: pct(summary.paid, summary.total) },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{t.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{t.value}</p>
            {t.sub && <p className="text-xs text-slate-400">{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* By source */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{t("pages.adminPages.bySource", { ns: "dashboard" })}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">{t("pages.adminCommon.source", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 text-right font-medium">{t("pages.adminPages.signups", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 text-right font-medium">{t("pages.adminPages.share", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 text-right font-medium">{t("pages.adminPages.paid", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 text-right font-medium">{t("pages.adminPages.conv", { ns: "dashboard" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.bySource.map((b) => (
                <tr key={b.source}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{b.source}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{b.signups}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {pct(b.signups, summary.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{b.paid}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {pct(b.paid, b.signups)}
                  </td>
                </tr>
              ))}
              {summary.bySource.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">{t("pages.adminPages.noSignups", { ns: "dashboard" })}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent signups */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{t("pages.adminPages.recentSignups", { ns: "dashboard" })}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">{t("pages.adminPages.date", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 font-medium">{t("pages.adminPages.account", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 font-medium">{t("pages.adminCommon.source", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 font-medium">{t("pages.adminPages.medium", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 font-medium">{t("pages.adminPages.campaign", { ns: "dashboard" })}</th>
                <th className="px-4 py-2 font-medium">{t("pages.adminPages.plan", { ns: "dashboard" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.recent.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtDate(r.created_at, locale)}</td>
                  <td className="px-4 py-2.5 text-slate-800">{r.brand_name || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.source}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.medium || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.campaign || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.plan_type}</td>
                </tr>
              ))}
              {summary.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{t("pages.adminPages.noSignups", { ns: "dashboard" })}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { AutomationProGate } from "@/components/funnel/AutomationProGate";
import { ReengagementPanel } from "@/components/crm/ReengagementPanel";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { fetchUserPortalContext } from "@/lib/rolePortalServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import type { Metadata } from "next";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.automation.metaTitle", { ns: "dashboard" }),
    description: t("pages.automation.metaDescription", { ns: "dashboard" }),
    keywords: ["automation", "lead follow-up", "drip campaigns"],
    robots: { index: false },
  };
}

export default async function AutomationPage() {
  await getCurrentAgentContext(); // auth guard via dashboard layout
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());

  const supabaseAuth = supabaseServerClient();
  const portalCtx = await fetchUserPortalContext(supabaseAuth);
  const isAdmin = String(portalCtx?.role ?? "").toLowerCase() === "admin";

  const { data: rules } = await supabaseServer
    .from("automation_rules")
    .select("id,name,trigger_type,active,condition,created_at")
    .order("created_at", { ascending: false });

  const { data: logs } = await supabaseServer
    .from("automation_logs")
    .select("id,contact_id,rule_id,message,status,created_at,rule:rule_id (name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("pages.automation.heading", { ns: "dashboard" })}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("pages.automation.intro", { ns: "dashboard" })}
        </p>
      </div>

      <AutomationProGate />

      <ReengagementPanel isAdmin={isAdmin} />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.automation.rules", { ns: "dashboard" })}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(rules as any[])?.map((r) => (
            <form
              key={r.id}
              action={`/api/dashboard/automation/rules/${r.id}`}
              method="post"
              className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-900/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.name}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {t("pages.automation.trigger", { ns: "dashboard" })} <span className="font-semibold">{r.trigger_type}</span>
                  </div>
                </div>
                <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                <button
                  type="submit"
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border ${
                    r.active
                      ? "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {t(r.active ? "pages.automation.disable" : "pages.automation.enable", { ns: "dashboard" })}
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {t("pages.automation.condition", { ns: "dashboard" })} {JSON.stringify(r.condition ?? {})}
              </div>
            </form>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.automation.recentMessages", { ns: "dashboard" })}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t("pages.automation.colWhen", { ns: "dashboard" })}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("pages.automation.colLead", { ns: "dashboard" })}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("pages.automation.colRule", { ns: "dashboard" })}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("pages.automation.colStatus", { ns: "dashboard" })}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("pages.automation.colMessage", { ns: "dashboard" })}</th>
              </tr>
            </thead>
            <tbody>
              {(logs as any[])?.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleString(locale) : "—"}
                  </td>
                  <td className="px-4 py-3">{String(l.contact_id)}</td>
                  <td className="px-4 py-3">{(l.rule as any)?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold">
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xl">
                    <div className="line-clamp-3 whitespace-pre-line">{l.message}</div>
                  </td>
                </tr>
              ))}
              {!(logs as any[])?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-slate-600 dark:text-slate-400">
                    {t("pages.automation.empty", { ns: "dashboard" })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


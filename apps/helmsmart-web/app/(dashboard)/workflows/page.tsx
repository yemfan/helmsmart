import type { Metadata } from "next";
import Link from "next/link";
import { Plus, GitBranch, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { listApprovalWorkflows, listApprovalRequests } from "@/lib/actions/approval-chains";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  return { title: t("meta.list") };
}

/** Colour + icon per request status. The label comes from the bundle. */
const STATUS_CONFIG = {
  pending:   { color: "bg-amber-100 text-amber-700",     icon: Clock },
  approved:  { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected:  { color: "bg-rose-100 text-rose-700",       icon: XCircle },
  cancelled: { color: "bg-slate-100 text-slate-500",     icon: AlertCircle },
  expired:   { color: "bg-slate-100 text-slate-500",     icon: AlertCircle },
} as const;

export default async function WorkflowsPage() {
  const t = await getServerT("workflows");
  const locale = await getServerLocale();
  const [workflows, recentRequests] = await Promise.all([
    listApprovalWorkflows(),
    listApprovalRequests(),
  ]);

  const pending = recentRequests.filter((r) => r.status === "pending");
  const recent  = recentRequests.slice(0, 10);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("list.subtitle")}</p>
        </div>
        <Link
          href="/workflows/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("list.newWorkflow")}
        </Link>
      </div>

      {/* Pending approvals alert */}
      {pending.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {t("list.pendingBanner", { count: pending.length })}
            </p>
            <div className="mt-2 space-y-1">
              {pending.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={`/workflows/requests/${r.id}`}
                  className="block text-xs text-amber-800 hover:text-amber-900 hover:underline"
                >
                  → {r.subject_label}
                </Link>
              ))}
              {pending.length > 3 && (
                <Link href="/workflows/requests" className="text-xs text-amber-700 font-medium hover:underline">
                  {t("list.morePending", { count: pending.length - 3 })} →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_360px] gap-6">
        {/* Workflows list */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("list.configured")}</h2>
          {workflows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <GitBranch className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">{t("list.emptyTitle")}</p>
              <p className="text-xs text-slate-400 mt-1 mb-5 max-w-xs mx-auto">
                {t("list.emptyBody")}
              </p>
              <Link
                href="/workflows/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("list.createFirst")}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map((wf) => {
                const stepCount = (wf.steps ?? []).length;
                return (
                  <Link
                    key={wf.id}
                    href={`/workflows/${wf.id}`}
                    className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-indigo-200 transition-all"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${wf.is_active ? "bg-indigo-100" : "bg-slate-100"}`}>
                      <GitBranch className={`w-4 h-4 ${wf.is_active ? "text-indigo-600" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{wf.name}</p>
                        {!wf.is_active && (
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                            {t("list.inactive")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t(`triggers.${wf.trigger_type}`, { defaultValue: wf.trigger_type })}
                        {wf.trigger_config?.amount_threshold != null && (
                          <>
                            {" · "}
                            {t("list.overThreshold", {
                              amount: Number(wf.trigger_config.amount_threshold).toLocaleString(intlLocale(locale)),
                            })}
                          </>
                        )}
                        {" · "}
                        {t("list.stepCount", { count: stepCount })}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent requests */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">{t("list.recentRequests")}</h2>
            <Link href="/workflows/requests" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              {t("list.viewAll")} →
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {recent.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                {t("list.noRequests")}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recent.map((req) => {
                  const cfg = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <Link
                      key={req.id}
                      href={`/workflows/requests/${req.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        req.status === "approved" ? "text-emerald-600" :
                        req.status === "rejected" ? "text-rose-600" :
                        req.status === "pending"  ? "text-amber-600" : "text-slate-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {req.subject_label}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(req.requested_at).toLocaleDateString(intlLocale(locale), {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${cfg.color}`}>
                        {t(`status.${req.status}`, { defaultValue: req.status })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

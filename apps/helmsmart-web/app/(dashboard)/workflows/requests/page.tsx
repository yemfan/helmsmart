import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { listApprovalRequests } from "@/lib/actions/approval-chains";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  return { title: t("meta.requests") };
}

/** Colour + icon per request status. The label comes from the bundle. */
const STATUS_CONFIG = {
  pending:   { color: "bg-amber-100 text-amber-700",     icon: Clock },
  approved:  { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected:  { color: "bg-rose-100 text-rose-700",       icon: XCircle },
  cancelled: { color: "bg-slate-100 text-slate-500",     icon: AlertCircle },
  expired:   { color: "bg-slate-100 text-slate-500",     icon: AlertCircle },
} as const;

export default async function ApprovalRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getServerT("workflows");
  const locale = await getServerLocale();
  const { status } = await searchParams;
  const requests = await listApprovalRequests(status);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/workflows" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{t("requests.title")}</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {["", "pending", "approved", "rejected"].map((s) => (
          <Link
            key={s}
            href={s ? `/workflows/requests?status=${s}` : "/workflows/requests"}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              status === s || (!status && !s)
                ? "bg-slate-900 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s ? t(`status.${s}`) : t("requests.filterAll")}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {t("requests.empty")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => {
              const cfg = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <Link
                  key={req.id}
                  href={`/workflows/requests/${req.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${
                    req.status === "approved" ? "text-emerald-600" :
                    req.status === "rejected" ? "text-rose-600" :
                    req.status === "pending"  ? "text-amber-500" : "text-slate-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{req.subject_label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t(`subjectType.${req.subject_type}`, { defaultValue: req.subject_type })} ·{" "}
                      {new Date(req.requested_at).toLocaleDateString(intlLocale(locale), {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>
                      {t(`status.${req.status}`, { defaultValue: req.status })}
                    </span>
                    {req.status === "pending" && (
                      <p className="text-xs text-slate-400 mt-1">{t("requests.step", { number: req.current_step })}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

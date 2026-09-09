import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { getApprovalRequest } from "@/lib/actions/approval-chains";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { ApprovalActionButtons } from "./approval-action-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  return { title: t("meta.request") };
}

const STATUS_COLOR = {
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  approved:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected:  "bg-rose-100 text-rose-700 border-rose-200",
  waiting:   "bg-slate-100 text-slate-500 border-slate-200",
  skipped:   "bg-slate-50 text-slate-400 border-slate-100",
};

export default async function ApprovalRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT("workflows");
  const locale = await getServerLocale();
  const { id } = await params;
  const request = await getApprovalRequest(id);
  if (!request) notFound();

  const steps = (request.steps as Array<{
    id: string;
    step_order: number;
    step_name: string;
    status: string;
    decided_at?: string;
    note?: string;
  }>).sort((a, b) => a.step_order - b.step_order);

  const workflow = request.workflow as { name: string; id: string } | null;
  const isOpen = request.status === "pending";
  const currentStepRecord = steps.find((s) => s.step_order === request.current_step && s.status === "pending");

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/workflows/requests" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900">{request.subject_label}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLOR[request.status as keyof typeof STATUS_COLOR] ?? STATUS_COLOR.pending}`}>
              {t(`status.${request.status}`, { defaultValue: request.status })}
            </span>
          </div>
          {workflow && (
            <p className="text-xs text-slate-500 mt-0.5">
              {t("request.workflowLabel")}{" "}
              <Link href={`/workflows/${workflow.id}`} className="hover:text-indigo-600">{workflow.name}</Link>
              {" · "}
              {t("request.requestedOn", {
                date: new Date(request.requested_at).toLocaleDateString(intlLocale(locale), {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
          )}
        </div>
      </div>

      {/* Steps timeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-6">{t("request.stepsTitle")}</h2>
        <div className="space-y-4">
          {steps.map((step, idx) => {
            const isCurrent = step.step_order === request.current_step && isOpen;
            const isCompleted = step.status === "approved" || step.status === "rejected";
            const isWaiting = step.status === "waiting";

            return (
              <div key={step.id} className="flex gap-4">
                {/* Timeline dot */}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                    step.status === "approved" ? "bg-emerald-100 border-emerald-300" :
                    step.status === "rejected" ? "bg-rose-100 border-rose-300" :
                    isCurrent ? "bg-amber-100 border-amber-300 animate-pulse" :
                    "bg-slate-100 border-slate-200"
                  }`}>
                    {step.status === "approved" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : step.status === "rejected" ? (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    ) : isCurrent ? (
                      <Clock className="w-4 h-4 text-amber-600" />
                    ) : (
                      <span className="text-xs font-bold text-slate-400">{step.step_order}</span>
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 min-h-4 ${isCompleted ? "bg-emerald-200" : "bg-slate-200"}`} />
                  )}
                </div>

                {/* Step content */}
                <div className={`flex-1 pb-4 ${isCurrent ? "bg-amber-50 -mx-2 px-2 rounded-lg" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${
                      step.status === "approved" ? "text-emerald-800" :
                      step.status === "rejected" ? "text-rose-800" :
                      isCurrent ? "text-amber-900" :
                      "text-slate-600"
                    }`}>
                      {step.step_name}
                    </p>
                    {isWaiting && (
                      <span className="text-xs text-slate-400 font-medium">{t("request.waiting")}</span>
                    )}
                    {isCompleted && step.decided_at && (
                      <span className="text-xs text-slate-400">
                        {new Date(step.decided_at).toLocaleDateString(intlLocale(locale), {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {step.note && (
                    <p className="text-xs text-slate-500 mt-1 italic">&ldquo;{step.note}&rdquo;</p>
                  )}
                  {isCurrent && isOpen && (
                    <p className="text-xs text-amber-700 mt-1 font-medium">⏳ {t("request.awaitingDecision")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      {isOpen && currentStepRecord && (
        <ApprovalActionButtons requestId={id} />
      )}

      {/* Rejection reason */}
      {request.status === "rejected" && request.rejection_reason && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-rose-800 mb-1">{t("request.rejectionTitle")}</p>
          <p className="text-sm text-rose-700">{request.rejection_reason}</p>
        </div>
      )}

      {/* Subject data snapshot */}
      {request.subject_data && Object.keys(request.subject_data).length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("request.detailsTitle")}</h2>
          <dl className="space-y-2">
            {Object.entries(request.subject_data as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <dt className="text-xs font-medium text-slate-500 capitalize w-32 flex-shrink-0">
                  {k.replace(/_/g, " ")}
                </dt>
                <dd className="text-sm text-slate-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

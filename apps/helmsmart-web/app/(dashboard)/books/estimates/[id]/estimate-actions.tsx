"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Send, CheckCircle2, XCircle, FileText, FolderOpen, Loader2,
} from "lucide-react";
import {
  sendEstimate,
  setEstimateStatus,
  convertEstimateToInvoice,
  convertEstimateToProject,
} from "@/lib/actions/estimates";

interface Props {
  estimateId: string;
  status: string;
  hasClientEmail: boolean;
  convertedInvoiceId: string | null;
  convertedProjectId: string | null;
}

export function EstimateActions({
  estimateId,
  status,
  hasClientEmail,
  convertedInvoiceId,
  convertedProjectId,
}: Props) {
  const { t } = useTranslation("books");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(
    action: string,
    fn: () => Promise<void | string>,
    redirectTo?: (id: string) => string
  ) {
    setActiveAction(action);
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (typeof result === "string" && redirectTo) {
          router.push(redirectTo(result));
        }
      } catch (err) {
        console.error("estimate action", err);
        setError(t("common:errors.generic"));
      } finally {
        setActiveAction(null);
      }
    });
  }

  const loading = isPending;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Send */}
      {(status === "draft" || status === "sent") && (
        <button
          onClick={() =>
            run("send", async () => {
              await sendEstimate(estimateId);
            })
          }
          disabled={loading || !hasClientEmail}
          title={!hasClientEmail ? t("estimates.actions.noClientEmail") : undefined}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading && activeAction === "send" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {status === "sent" ? t("estimates.actions.resend") : t("estimates.actions.send")}
        </button>
      )}

      {/* Accept */}
      {(status === "sent" || status === "draft") && (
        <button
          onClick={() =>
            run("accept", async () => {
              await setEstimateStatus(estimateId, "accepted");
            })
          }
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {loading && activeAction === "accept" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {t("estimates.actions.markAccepted")}
        </button>
      )}

      {/* Decline */}
      {(status === "sent" || status === "draft") && (
        <button
          onClick={() =>
            run("decline", async () => {
              await setEstimateStatus(estimateId, "declined");
            })
          }
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {loading && activeAction === "decline" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          {t("estimates.actions.markDeclined")}
        </button>
      )}

      {/* Convert to invoice */}
      {status === "accepted" && !convertedInvoiceId && (
        <button
          onClick={() => run("convert", () => convertEstimateToInvoice(estimateId), (id) => `/books/invoices/${id}`)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading && activeAction === "convert" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {t("estimates.actions.convertToInvoice")}
        </button>
      )}

      {/* Create project */}
      {status === "accepted" && !convertedProjectId && (
        <button
          onClick={() => run("convert-project", () => convertEstimateToProject(estimateId), (id) => `/projects/${id}`)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-indigo-200 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
        >
          {loading && activeAction === "convert-project" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderOpen className="w-4 h-4" />
          )}
          {t("estimates.actions.createProject")}
        </button>
      )}
    </div>
  );
}

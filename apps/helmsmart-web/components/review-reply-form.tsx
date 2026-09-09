"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { replyToReview } from "@/lib/actions/google-business";
import { Send, Loader2, CheckCircle2 } from "lucide-react";

export function ReviewReplyForm({
  reviewId,
  businessLocationId,
}: {
  reviewId: string;
  businessLocationId: string;
}) {
  const { t } = useTranslation("marketing");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "replying" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!text.trim()) return;

    setError("");
    setStatus("replying");

    startTransition(async () => {
      const result = await replyToReview(reviewId, text.trim());
      if (result.ok) {
        setStatus("sent");
        setText("");
        setTimeout(() => {
          // Optionally refresh the page or reset state
          window.location.reload();
        }, 1500);
      } else {
        setError(result.error || t("google.reply.sendFailed"));
        setStatus("error");
      }
    });
  };

  if (status === "sent") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-emerald-900">{t("google.reply.sentTitle")}</p>
          <p className="text-sm text-emerald-700 mt-0.5">{t("google.reply.sentBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-4">
      <p className="text-xs font-medium text-slate-600 mb-3">{t("google.reply.label")}</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={status === "replying"}
        rows={3}
        maxLength={1000}
        placeholder={t("google.reply.placeholder")}
        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
      />

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-slate-500">
          {text.length}/1000
        </p>
        <button
          onClick={handleSubmit}
          disabled={status === "replying" || !text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {status === "replying" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <Send className="w-3.5 h-3.5" />
          {status === "replying" ? t("common:status.sending") : t("google.reply.send")}
        </button>
      </div>

      {error && status === "error" && (
        <p className="text-xs text-rose-600 mt-2" role="alert">{error}</p>
      )}
    </div>
  );
}

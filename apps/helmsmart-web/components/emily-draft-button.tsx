"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Check } from "lucide-react";
import { letEmilyDraftPost } from "@/lib/actions/approvals";

export function EmilyDraftButton() {
  const { t } = useTranslation("marketing");
  const [status, setStatus] = useState<"idle" | "created" | "error">("idle");
  const [, startTransition] = useTransition();

  function ask() {
    startTransition(async () => {
      const res = await letEmilyDraftPost();
      setStatus(res.status === "created" ? "created" : "error");
    });
  }

  if (status === "created") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Check className="w-4 h-4" />
        <span>{t("social.emily.draftCreated")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={ask}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {t("social.emily.ask")}
      </button>
      {status === "error" && <p className="text-xs text-rose-500" role="alert">{t("social.emily.error")}</p>}
    </div>
  );
}

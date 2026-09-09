"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { toggleAutoRequestReviews } from "@/lib/actions/google-business";
import { Settings, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export function GoogleBusinessSettings({ autoRequestEnabled }: { autoRequestEnabled: boolean }) {
  const { t } = useTranslation("marketing");
  const [enabled, setEnabled] = useState(autoRequestEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const handleToggle = (newValue: boolean) => {
    setEnabled(newValue);
    setStatus("saving");
    setError("");

    startTransition(async () => {
      const result = await toggleAutoRequestReviews(newValue);
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setError(result.error || t("google.settings.saveFailed"));
        setStatus("error");
        setEnabled(!newValue); // Revert
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-slate-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-slate-900">{t("google.settings.title")}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {t("google.settings.desc")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === "saving" && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
          {status === "saved" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {status === "error" && <AlertCircle className="w-5 h-5 text-rose-500" />}

          <button
            onClick={() => handleToggle(!enabled)}
            disabled={status === "saving"}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                enabled ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {error && status === "error" && (
        <p className="text-xs text-rose-600 mt-3" role="alert">{error}</p>
      )}

      {enabled && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
          {t("google.settings.enabledNote")}
        </div>
      )}
    </div>
  );
}

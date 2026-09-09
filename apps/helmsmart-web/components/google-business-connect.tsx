"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

type Status = "idle" | "connecting" | "connected" | "error";

export function GoogleBusinessConnect() {
  const { t } = useTranslation("marketing");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // Check for success/error from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("gmb")) {
      setStatus("connected");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("gmb_error")) {
      setError(params.get("gmb_error") || "");
      setStatus("error");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = () => {
    setStatus("connecting");
    window.location.href = "/api/auth/google-business";
  };

  if (status === "connected") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-900">{t("google.connect.connectedTitle")}</p>
            <p className="text-sm text-emerald-700 mt-1">
              {t("google.connect.connectedBody")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("google.connect.title")}</h2>
        <p className="text-sm text-slate-600">
          {t("google.connect.body")}
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-blue-900 mb-2">{t("google.connect.benefitsTitle")}</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {(["benefitSync", "benefitRespond", "benefitSentiment", "benefitNotify"] as const).map((key) => (
            <li key={key}>✓ {t(`google.connect.${key}`)}</li>
          ))}
        </ul>
      </div>

      {status === "error" && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-6 flex gap-3" role="alert">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-rose-900">{t("google.connect.failed")}</p>
            {error && <p className="text-sm text-rose-700 mt-1">{error}</p>}
          </div>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={status === "connecting"}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors"
      >
        {status === "connecting" && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "connecting" ? t("google.connect.connecting") : t("google.connect.button")}
      </button>

      <p className="text-xs text-slate-500 mt-4 text-center">
        {t("google.connect.disclaimer1")}
        <br />
        {t("google.connect.disclaimer2")}
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";

type PropertyRow = {
  id: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

export default function OpenHouseQrList({
  properties,
  agentId,
}: {
  properties: PropertyRow[];
  agentId: string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { t } = useTranslation("dashboard");

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
    } catch (e) {
      console.error("Copy failed", e);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 space-y-2">
        <h1 className="text-2xl font-bold text-brand-text">{t("pages.openHouseQr.heading")}</h1>
        <p className="text-sm text-brand-text/80">
          {t("pages.openHouseQr.printBefore")} <span className="font-semibold">{t("pages.openHouseQr.openHouse")}</span>{t("pages.openHouseQr.printAfter")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {properties.map((p) => {
          const signupUrl = `${origin}/open-house-signup?property_id=${encodeURIComponent(
            p.id
          )}&agent_id=${encodeURIComponent(agentId)}`;
          const codeLabel =
            p.address?.trim() ||
            [p.city, p.state, p.zip_code].filter(Boolean).join(", ") ||
            p.id;

          return (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-brand-text truncate">
                    {codeLabel}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <div className="bg-brand-surface border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                  <QRCode value={signupUrl} size={120} />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-xs font-semibold text-brand-text">{t("pages.openHouseQr.signupLink")}</div>
                  <input
                    readOnly
                    value={signupUrl}
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-brand-surface text-brand-text"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-primary text-white hover:bg-[#005ca8]"
                      onClick={() => copy(signupUrl, p.id)}
                    >
                      {copiedId === p.id ? t("pages.openHouseQr.copied") : t("pages.openHouseQr.copyLink")}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-brand-text hover:bg-brand-surface"
                      onClick={() => window.open(signupUrl, "_blank", "noopener,noreferrer")}
                    >{t("pages.openHouseQr.open")}</button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500">{t("pages.openHouseQr.visitorNote")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


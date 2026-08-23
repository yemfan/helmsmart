"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function PaywallModal(props: {
  open: boolean;
  onClose: () => void;
  message?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** When set, dialog closes first, then this runs (e.g. `startCheckout` → Stripe). */
  onPrimaryClick?: () => void | Promise<void>;
}) {
  const { t } = useTranslation("dashboard");
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  async function handlePrimary() {
    props.onClose();
    if (props.onPrimaryClick) {
      await props.onPrimaryClick();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
        aria-label={t("pages.paywallModal.closeDialog")}
        onClick={props.onClose}
      />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leadsmart-paywall-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div id="leadsmart-paywall-title" className="text-sm font-semibold text-slate-900">{t("pages.paywallModal.title")}</div>
            <div className="text-xs text-slate-600 mt-1">
              {props.message ?? t("pages.paywall.youVeReachedYour")}
            </div>
          </div>
          <button
            type="button"
            className="text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50"
            onClick={props.onClose}
          >{t("pages.paywallModal.close")}</button>
        </div>
        <div className="p-5 space-y-3">
          {props.onPrimaryClick ? (
            <button
              type="button"
              className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() => void handlePrimary()}
            >
              {props.ctaLabel ?? t("pages.paywall.startFreeTrial")}
            </button>
          ) : (
            <a
              href={props.ctaHref ?? "/agent/pricing?checkout_plan=pro"}
              className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() => props.onClose()}
            >
              {props.ctaLabel ?? t("pages.paywall.startFreeTrial")}
            </a>
          )}
          <p className="text-[11px] text-slate-500">{t("pages.paywallModal.sub")}</p>
        </div>
      </div>
    </div>
  );
}


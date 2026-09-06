"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Per-contact "Generate CMA" CTA on the contact profile.
 *
 * Pre-fills the address from the contact's closing/property address
 * and tags the new CMA with `contactId` so the report links back to
 * the seller-prospect. On success, navigates to the detail page.
 *
 * Quota status is fetched on open so the agent doesn't fill out the
 * form only to be rejected at submit.
 */

type CmaQuota = {
  used: number;
  limit: number;
  remaining: number;
  reached: boolean;
  warning: boolean;
  resetDate: string;
};

export default function GenerateCmaButton({
  contactId,
  defaultAddress,
}: {
  contactId: string;
  defaultAddress: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<CmaQuota | null>(null);

  // Reset to defaults each time the modal opens (so a follow-up
  // generation on the same contact doesn't keep stale state).
  useEffect(() => {
    if (!open) return;
    setAddress(defaultAddress ?? "");
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/cma/quota", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          quota?: CmaQuota;
        };
        if (data.ok && data.quota) setQuota(data.quota);
      } catch {
        /* non-fatal */
      }
    })();
  }, [open, defaultAddress]);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/cma", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectAddress: address.trim(),
          contactId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        cma?: { id: string };
        error?: string;
      };
      if (!res.ok || data.ok === false || !data.cma?.id) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Navigate to the new CMA's detail view — the agent's next step
      // is reviewing the comps + listing strategies anyway.
      router.push(`/dashboard/cma/${encodeURIComponent(data.cma.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate CMA");
    } finally {
      setSubmitting(false);
    }
  }, [address, contactId, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >{t("pages.generateCma.button")}</button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.generateCma.title")}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{t("pages.generateCma.sub")}</p>
              </div>
              {quota ? (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                    quota.reached
                      ? "bg-rose-50 text-rose-700 ring-rose-200"
                      : quota.warning
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : "bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 ring-slate-200"
                  }`}
                >
                  {t("pages.generateCma.quotaLeft", { remaining: quota.remaining, limit: quota.limit })}
                </span>
              ) : null}
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("pages.generateCma.subjectAddress")}</span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Austin, TX 78701"
                className="mt-1 block w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                disabled={submitting || quota?.reached === true}
              />
            </label>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="min-h-[20px] text-xs">
                {error ? (
                  <span className="text-rose-600">{error}</span>
                ) : quota?.reached ? (
                  <span className="text-amber-700">{t("pages.generateCma.limitReached")}</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={submitting}
                >{t("pages.generateCma.cancel")}</button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={
                    submitting ||
                    address.trim().length === 0 ||
                    quota?.reached === true
                  }
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? t("common:status.generating") : t("common:actions.generate")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

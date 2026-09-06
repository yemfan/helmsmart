"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * "Email to seller" CTA on the CMA detail page. Collects recipient
 * email + an optional cover note, then POSTs to
 * /api/dashboard/cma/[id]/email which handles PDF generation +
 * Resend dispatch on the server.
 *
 * Closes onSuccess so the agent sees a tiny confirmation and can
 * move on. No optimistic state — we wait for the server to confirm
 * the Resend call before showing "sent".
 */
export default function CmaEmailToSellerButton({
  cmaId,
  defaultRecipient,
}: {
  cmaId: string;
  defaultRecipient: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultRecipient ?? "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = useCallback(() => {
    setTo(defaultRecipient ?? "");
    setMessage("");
    setError(null);
    setSent(false);
  }, [defaultRecipient]);

  const onClose = useCallback(() => {
    setOpen(false);
    // Hold the success flash open for a beat before clearing on next open.
    setTimeout(reset, 200);
  }, [reset]);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/cma/${encodeURIComponent(cmaId)}/email`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: to.trim(), message }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }, [cmaId, to, message]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
      >
        {t("pages.cmaEmail.emailToSeller")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.cmaEmail.title")}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t("pages.cmaEmail.sub")}</p>

            {sent ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-emerald-800">{t("pages.cmaEmail.sent")}</p>
                <p className="mt-1 text-xs text-emerald-700">{t("pages.cmaEmail.repliesRoute")}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-lg border border-emerald-200 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >{t("pages.cmaEmail.close")}</button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">To</span>
                  <input
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="seller@example.com"
                    className="mt-1 block w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    disabled={submitting}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("pages.cmaEmail.coverNote")}<span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder={`Hi — I put together a quick CMA for your property. Happy to walk through the comps + the strategy whenever you're ready.`}
                    className="mt-1 block w-full resize-y rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    disabled={submitting}
                  />
                </label>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="min-h-[20px] text-xs">
                    {error ? <span className="text-rose-600">{error}</span> : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={submitting}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >{t("pages.cmaEmail.cancel")}</button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={submitting || to.trim().length === 0}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? t("common:status.sending") : t("common:actions.send")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

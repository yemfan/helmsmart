"use client";

import { useActionState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { changePassword } from "@/lib/actions/auth";

/**
 * Change-password modal opened from the account menu. Calls the in-app changePassword
 * action (Supabase updateUser) and closes itself shortly after success.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("auth");
  const [state, action, pending] = useActionState(changePassword, null);
  const ok = state !== null && "ok" in state;

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(onClose, 1200);
    return () => clearTimeout(t);
  }, [ok, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-900 mb-1">{t("changePassword.title")}</h2>
        <p className="text-xs text-slate-500 mb-4">{t("changePassword.subtitle")}</p>

        {ok ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            {t("changePassword.updated")}
          </p>
        ) : (
          <form action={action} className="space-y-3">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("changePassword.newPasswordPlaceholder")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("changePassword.confirmPlaceholder")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {state !== null && "error" in state && (
              <p className="text-xs text-rose-600">{state.error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {pending ? t("common:status.saving") : t("changePassword.submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

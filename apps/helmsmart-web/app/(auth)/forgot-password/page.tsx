"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { requestPasswordReset } from "@/lib/actions/auth";
import type { AuthState } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const [state, action, isPending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    null
  );

  // The action flags the "check your email" outcome explicitly — sniffing the
  // message text stops working the moment the message is translated.
  const isSent = state?.sent === true;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">{t("forgotPassword.title")}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {t("forgotPassword.subtitle")}
      </p>

      {isSent ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center">
          {state?.error}
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              {t("forgotPassword.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         disabled:bg-slate-50 disabled:text-slate-500"
              placeholder={t("forgotPassword.emailPlaceholder")}
            />
          </div>

          {state?.error && !isSent && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                       hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                       disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? t("common:status.sending") : t("forgotPassword.submit")}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
          {t("forgotPassword.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}

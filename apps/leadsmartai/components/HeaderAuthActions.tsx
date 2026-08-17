"use client";

import { useAuth } from "@/components/AuthProvider";
import AccountMenu from "@/components/layout/AccountMenu";
import { useTranslation } from "react-i18next";

/**
 * Same pattern as PropertyTools: Sign in + Sign up when logged out; Account dropdown when logged in.
 */
export default function HeaderAuthActions() {
  const { t } = useTranslation("dashboard");
  const { user, loading, openAuth } = useAuth();

  if (loading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" aria-hidden />
    );
  }

  if (user) {
    return <AccountMenu />;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => openAuth("login")}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 sm:text-sm"
      >{t("pages.misc.signIn")}</button>
      <button
        type="button"
        onClick={() => openAuth("signup")}
        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 sm:text-sm"
      >{t("pages.misc.signUp")}</button>
    </div>
  );
}

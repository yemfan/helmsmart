"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("dashboard");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await sendPasswordResetEmail(email);
      if (result.ok === false) {
        setError(result.message);
        return;
      }
      setSuccess("Check your email for a link to reset your password.");
      setEmail("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-bold text-gray-900">{t("pages.dashFragments.resetPassword")}</h1>
          <p className="text-xs text-gray-600">{t("pages.dashFragments.resetBody")}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.articleChrome.email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          {error ? (
            <p className="text-[11px] font-medium text-red-600 whitespace-pre-line">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-900">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-gray-500">
          <Link href="/login" className="font-semibold text-blue-700 hover:underline">{t("pages.dashFragments.backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}

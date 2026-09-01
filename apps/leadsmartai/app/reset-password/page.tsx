"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Phase = "checking" | "ready" | "no_session" | "success";

/**
 * Supabase recovery landing — same path as Property Tools (`/reset-password`) so one Redirect URL per host works.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    /**
     * Turn the recovery link into a session ourselves.
     *
     * `createBrowserClient` (@supabase/ssr) hard-codes `flowType: "pkce"`, and
     * auth-js refuses to read an implicit-grant callback under that flow —
     * `_getSessionFromURL` throws `Not a valid PKCE flow url.` the moment it
     * sees `#access_token=…`. Our recovery mail is exactly that shape
     * (`/auth/v1/verify?token=…&type=recovery` → `…/reset-password#access_token=…`),
     * so its auto-detection silently dropped every single link and this page
     * called a perfectly good token expired. Reading the URL by hand works for
     * whichever shape arrives — implicit hash, PKCE `?code=`, or `?token_hash=`.
     */
    async function establishSession(): Promise<boolean> {
      // Let the client finish its own (failed) URL detection first, so our
      // write isn't racing its initialization.
      const { data: existing } = await supabase.auth.getSession();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const param = (key: string) => hash.get(key) ?? query.get(key);

      // Supabase reports a genuinely dead link in the fragment rather than as
      // an HTTP error — treat it as such instead of silently retrying.
      if (param("error") || param("error_description")) return false;

      const accessToken = param("access_token");
      const refreshToken = param("refresh_token");
      const code = query.get("code");
      const tokenHash = param("token_hash");

      let ok = Boolean(existing.session?.user);

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        ok = Boolean(data.session?.user) && !error;
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        ok = Boolean(data.session?.user) && !error;
      } else if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        ok = Boolean(data.session?.user) && !error;
      }

      // Don't leave the one-time credentials sitting in the address bar.
      if (ok && (accessToken || code || tokenHash)) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return ok;
    }

    void (async () => {
      let ok = false;
      try {
        ok = await establishSession();
      } catch {
        ok = false;
      }
      if (cancelled) return;
      setPhase(ok ? "ready" : "no_session");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("pages.resetPasswordPage.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("pages.resetPasswordPage.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const supabase = supabaseBrowser();
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(updErr.message);
        return;
      }
      setPhase("success");
      router.refresh();
      window.setTimeout(() => {
        router.replace("/dashboard-router");
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("pages.resetPasswordPage.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-slate-600">{t("pages.resetPasswordPage.verifying")}</p>
      </div>
    );
  }

  if (phase === "no_session") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 text-center">
          <h1 className="text-lg font-bold text-gray-900">{t("pages.resetPasswordPage.linkExpired")}</h1>
          <p className="text-sm text-gray-600">
            {t("pages.resetPasswordPage.linkExpiredBody")}
          </p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t("pages.resetPasswordPage.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-medium text-emerald-900">
          {t("pages.resetPasswordPage.updated")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-bold text-gray-900">{t("pages.resetPasswordPage.heading")}</h1>
          <p className="text-xs text-gray-600">{t("pages.resetPasswordPage.sub")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.resetPasswordPage.newPassword")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.resetPasswordPage.confirmPassword")}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          {error ? <p className="text-[11px] font-medium text-red-600 whitespace-pre-line">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t("pages.resetPasswordPage.saving") : t("pages.resetPasswordPage.submit")}
          </button>
        </form>
        <p className="text-center text-[11px] text-gray-500">
          <Link href="/login" className="font-semibold text-blue-700 hover:underline">
            {t("pages.resetPasswordPage.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}

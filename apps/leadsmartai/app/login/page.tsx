"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { safeInternalRedirect } from "@/lib/loginUrl";
import { isRealEstateProfessionalRole } from "@/lib/paidSubscriptionEligibility";
import { resolveRoleHomePath, START_FREE_AGENT_PATH } from "@/lib/rolePortalPaths";
import { getOAuthRedirectOrigin } from "@/lib/siteUrl";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const { user: sessionUser } = useAuth();
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect") ?? searchParams?.get("next");
  const reason = searchParams?.get("reason");
  const oauthError = searchParams?.get("error") === "oauth";
  const oauthProvider = searchParams?.get("provider") ?? "";

  const [email, setEmail] = useState("");

  useEffect(() => {
    const q = searchParams?.get("email");
    if (!q) return;
    try {
      setEmail(decodeURIComponent(q).trim());
    } catch {
      setEmail(q.trim());
    }
  }, [searchParams]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError(t("pages.loginPage.emailPasswordRequired"));
      return;
    }
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        /*
         * signInWithPassword resolved, so the credentials were good — getUser
         * just lost the race with the session write. Guessing a destination
         * here is how a successful login ends up looking like a failed one;
         * /dashboard-router resolves the role server-side instead.
         */
        window.location.assign("/dashboard-router");
        return;
      }
      let role: string | null = null;
      let hasAgentRow = false;
      let isPro = false;
      let onboardingCompleted = false;
      if (user) {
        try {
          const missingUserId = (err: any) => {
            const msg = String(err?.message ?? "");
            return (
              /user_id.*does not exist/i.test(msg) ||
              /column\s+.*user_id.*does not exist/i.test(msg)
            );
          };

          let userRow: any = null;
          let rowErr: any = null;
          ({ data: userRow, error: rowErr } = await supabase
            .from("leadsmart_users")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle());

          if (rowErr && missingUserId(rowErr)) {
            rowErr = null;
          }

          const r = (userRow as { role?: string } | null)?.role;
          role = r ?? null;

          const { data: agentRow } = await supabase
            .from("agents")
            .select("id, onboarding_completed")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          hasAgentRow = !!agentRow;
          onboardingCompleted =
            (agentRow as { onboarding_completed?: boolean } | null)?.onboarding_completed === true;

          if (!rowErr && r === "user" && !hasAgentRow) {
            isPro = false;
          } else {
            isPro = isRealEstateProfessionalRole(r) || hasAgentRow;
          }
        } catch {
          const { data: agentRow } = await supabase
            .from("agents")
            .select("id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          hasAgentRow = !!agentRow;
          isPro = hasAgentRow;
        }
      }

      const safe = redirectParam ? safeInternalRedirect(redirectParam) : null;
      if (isPro || hasAgentRow) {
        if (safe) {
          router.replace(safe);
        } else {
          // First-run agents meet Max (the AI-team onboarding) before the
          // dashboard. Authoritative flag is agents.onboarding_completed;
          // localStorage is a fast secondary guard against a lagged write.
          let seenWelcome = onboardingCompleted;
          if (!seenWelcome) {
            try {
              seenWelcome = localStorage.getItem("rb_welcome_seen_v1") === "1";
            } catch {
              /* ignore */
            }
          }
          window.location.assign(
            seenWelcome ? resolveRoleHomePath(role, hasAgentRow) : "/welcome",
          );
        }
      } else {
        // Signed in, but no agent workspace. Sending them to the marketing
        // home here is what made a successful login look like a broken one —
        // route to the conversion page instead, carrying their intent.
        const safeFallback = redirectParam ? safeInternalRedirect(redirectParam) : null;
        router.replace(
          safeFallback ??
            `${START_FREE_AGENT_PATH}?next=${encodeURIComponent("/dashboard")}`
        );
      }
    } catch (e: any) {
      setError(e?.message ?? t("pages.loginPage.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const raw = redirectParam;
      const nextPath = safeInternalRedirect(raw) ?? "/dashboard";
      const origin = getOAuthRedirectOrigin();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}&provider=${provider}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("pages.loginPage.signInFailedGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    try {
      if (typeof window !== "undefined" && document.referrer) {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin) {
          router.back();
          return;
        }
      }
    } catch {
      /* ignore invalid referrer */
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >{t("pages.loginPage.cancel")}</button>
        </div>
        {reason === "trial" ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-center text-[11px] font-medium text-sky-950">{t("pages.loginPage.trialNotice")}</p>
        ) : null}
        {reason === "checkout" ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-center text-[11px] font-medium text-sky-950">{t("pages.loginPage.checkoutNotice")}</p>
        ) : null}
        {oauthError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-center text-[11px] font-medium text-red-800">
            {oauthProvider === "apple" ? "Apple" : "Google"} {t("pages.loginPage.signInFailed")}</p>
        ) : null}

        {/* Create account leads — new visitors should start here (Zillow-style).
            Sign-in for returning users sits below the divider. */}
        <div className="space-y-1.5 text-center">
          <a
            href="/agent-signup"
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >{t("pages.loginPage.createAccount")}</a>
          <p className="text-[11px] text-gray-500">{t("pages.loginPage.meetMax")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("pages.loginPage.orSignIn")}</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.articleChrome.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.loginPage.password")}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="current-password"
                required
              />
              {/* type="button" matters: inside a form a bare button submits it, so
                  revealing the password would try to log you in. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t("pages.loginPage.hidePassword") : t("pages.loginPage.showPassword")}
                title={showPassword ? t("pages.loginPage.hidePassword") : t("pages.loginPage.showPassword")}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-r-lg"
              >
                {showPassword ? (
                  // Eye with a line through it — the password is currently visible.
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >{t("pages.loginPage.forgotPassword")}</Link>
            </div>
          </div>
          {error && (
            <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? t("pages.loginPage.loggingIn") : t("pages.loginPage.logIn")}
          </button>
        </form>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("pages.loginPage.or")}</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleOAuth("google")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >{t("pages.loginPage.continueGoogle")}</button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleOAuth("apple")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >{t("pages.loginPage.continueApple")}</button>
        </div>
        <div className="text-[11px] text-gray-500 text-center space-y-2">
          {!sessionUser ? (
            <p>{t("pages.loginPage.areYouAgent")}{" "}
              <a className="text-blue-700 font-semibold" href="/agent-signup">{t("pages.loginPage.startFreeAgent")}</a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}


"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { safeInternalRedirect } from "@/lib/loginUrl";
import { isRealEstateProfessionalRole } from "@/lib/paidSubscriptionEligibility";
import { resolveRoleHomePath } from "@/lib/rolePortalPaths";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
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
          router.replace(seenWelcome ? resolveRoleHomePath(role, hasAgentRow) : "/welcome");
        }
      } else {
        const fallback = redirectParam ?? "/";
        const safeFallback = safeInternalRedirect(fallback);
        router.replace(safeFallback ?? "/");
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
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
      setError(e instanceof Error ? e.message : "Sign in failed.");
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

  async function handleForgotPassword() {
    setError(null);
    setResetNotice(null);
    setResetSending(true);
    try {
      const result = await sendPasswordResetEmail(email);
      if (result.ok === false) {
        setError(result.message);
        return;
      }
      setResetNotice("Check your email for a link to reset your password.");
    } finally {
      setResetSending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
        {reason === "trial" ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-center text-[11px] font-medium text-sky-950">
            Sign in to continue. Next, we’ll open secure Stripe checkout for your Pro free trial (card on file; you are
            not charged until the trial ends).
          </p>
        ) : null}
        {reason === "checkout" ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-center text-[11px] font-medium text-sky-950">
            Sign in to continue to checkout. We’ll return you to pricing right after.
          </p>
        ) : null}
        {oauthError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-center text-[11px] font-medium text-red-800">
            {oauthProvider === "apple" ? "Apple" : "Google"} sign-in could not be completed. This can happen if the sign-in window was open
            too long or was opened in a different browser tab. Please try again.
          </p>
        ) : null}

        {/* Create account leads — new visitors should start here (Zillow-style).
            Sign-in for returning users sits below the divider. */}
        <div className="space-y-1.5 text-center">
          <a
            href="/signup"
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Create your free account
          </a>
          <p className="text-[11px] text-gray-500">Meet Max and your AI real estate team in minutes.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">or sign in</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleOAuth("google")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with Google
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleOAuth("apple")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with Apple
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">Email</label>
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
            <label className="block text-xs font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
              required
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={loading || resetSending}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
              >
                {resetSending ? "Sending…" : "Email me a reset link"}
              </button>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          {resetNotice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-900">
              {resetNotice}
            </p>
          ) : null}
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
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>
        <div className="text-[11px] text-gray-500 text-center space-y-2">
          {!sessionUser ? (
            <p>
              Real estate agent?{" "}
              <a className="text-blue-700 font-semibold" href="/agent-signup">
                Start free as agent
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}


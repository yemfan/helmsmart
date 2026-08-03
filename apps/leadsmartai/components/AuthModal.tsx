"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fullNameFromUserMetadata } from "@/lib/auth/canonicalUserContact";
import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { isRealEstateProfessionalRole } from "@/lib/paidSubscriptionEligibility";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { consumerShouldUsePropertyToolsApp } from "@/lib/signupOriginApp";
import { resolveRoleHomePath } from "@/lib/rolePortalPaths";
import { getOAuthRedirectOrigin } from "@/lib/siteUrl";

type Mode = "login" | "signup";

export default function AuthModal({
  open,
  onClose,
  initialMode = "login",
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  onAuthenticated?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode ?? "login");
    setError(null);
    setResetNotice(null);

    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;
        const u = session.user;
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", u.id)
          .maybeSingle();
        const row = prof as { full_name?: string | null } | null;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = fullNameFromUserMetadata(meta) ?? "";
        setEmail(u.email?.trim() ?? "");
        setFullName(row?.full_name?.trim() || metaName || "");
      } catch (e) {
        console.error("[AuthModal] session prefill", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  async function signInWithOAuth(provider: "google" | "apple") {
    setError(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      // Exclude auth pages as redirect targets — they would loop the user back to the
      // login dialog after Google/Apple completes. Default to / instead.
      const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];
      const rawNext = `${window.location.pathname}${window.location.search}`;
      const isAuthPage = AUTH_PAGES.some((p) => window.location.pathname.startsWith(p));
      const next = (!isAuthPage && rawNext) || "/";
      const origin = getOAuthRedirectOrigin();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      if (mode === "login") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onAuthenticated?.();
        onClose();
        router.refresh?.();

        // If the signed-in user is an agent, take them straight to the dashboard.
        // (Homepage stays public; this is only the post-auth UX.)
        try {
          // Pass the fresh access token as a Bearer — right after sign-in the
          // server-side auth cookie may not be synced yet, so a cookie-only
          // /api/me returns "guest", which mis-routed agents to the homepage.
          const token = signInData.session?.access_token;
          const meRes = await fetch("/api/me", {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as {
              role?: string;
              has_agent_record?: boolean;
              signup_origin_app?: string | null;
            };
            const role = me?.role ?? null;
            const hasAgent = Boolean(me?.has_agent_record);
            if (isRealEstateProfessionalRole(role) || hasAgent) {
              // HARD navigation (not router.replace): the dashboard is a protected
              // SSR route, and a client-side nav right after sign-in races the
              // Supabase auth cookie — the server renders it as guest and bounces
              // to "/". A full-page load guarantees the fresh cookie is sent.
              window.location.assign(resolveRoleHomePath(role, hasAgent));
            } else if (consumerShouldUsePropertyToolsApp(me?.signup_origin_app)) {
              window.location.assign(getPropertyToolsConsumerPostLoginUrl());
            } else {
              router.replace("/");
            }
          }
        } catch {
          // Best-effort: if /api/me fails, we just keep the current page refresh.
        }
        return;
      }

      if (!fullName.trim()) {
        setError("Name is required.");
        return;
      }

      // Signups from this modal are always consumers — agents sign up via
      // the dedicated /agent-signup flow which captures license / brokerage
      // / phone. The Role dropdown was removed to keep consumer conversion
      // high (fewer fields).
      const dbRole = "user";
      const phoneForProfile: string | null = null;

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });
      if (signUpErr) throw signUpErr;

      const userId = data?.user?.id;
      if (userId) {
        // Best-effort: create profile row (RLS may require policies).
        await supabase.from("user_profiles").upsert(
          {
            user_id: userId,
            full_name: fullName.trim(),
            phone: phoneForProfile,
          } as Record<string, unknown>,
          { onConflict: "user_id" }
        );
        await supabase.from("leadsmart_users").upsert(
          {
            user_id: userId,
            role: dbRole,
            oauth_onboarding_completed: true,
          } as Record<string, unknown>,
          { onConflict: "user_id" }
        );
        if (dbRole === "user") {
          await supabase.from("propertytools_users").upsert(
            { user_id: userId, tier: "basic" } as Record<string, unknown>,
            { onConflict: "user_id" }
          );
        }
        const {
          data: { session: postSignUpSession },
        } = await supabase.auth.getSession();
        const tok = postSignUpSession?.access_token;
        if (tok) {
          await fetch("/api/me/profile", {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tok}`,
            },
            body: JSON.stringify({ signup_origin_app: "leadsmart" }),
          });
        }
      }

      onAuthenticated?.();

      // Signups from this modal are always consumers (role="user") — the
      // old "agentStartFree" branch lived here when the Role dropdown
      // could flip this modal into an agent-signup flow. Agents now go
      // through /agent-signup which has its own post-signup UX.
      if (userId) {
        onClose();
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        const meRes = s?.access_token
          ? await fetch("/api/me", {
              credentials: "include",
              headers: { Authorization: `Bearer ${s.access_token}` },
            })
          : null;
        const me = meRes?.ok ? ((await meRes.json()) as { signup_origin_app?: string | null }) : null;
        if (consumerShouldUsePropertyToolsApp(me?.signup_origin_app)) {
          window.location.assign(getPropertyToolsConsumerPostLoginUrl());
        } else {
          router.replace("/");
          router.refresh?.();
        }
        return;
      }

      onClose();
      router.refresh?.();
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer border-0 bg-slate-900/40 p-0 backdrop-blur-sm"
        aria-label="Close"
        onClick={() => !loading && onClose()}
      />

      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in or create account"
      >
        <button
          type="button"
          onClick={() => !loading && onClose()}
          disabled={loading}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <div className="p-4 pt-12 sm:p-5 sm:pt-12 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border ${
                mode === "login"
                  ? "bg-white border-slate-300 text-slate-900"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border ${
                mode === "signup"
                  ? "bg-white border-slate-300 text-slate-900"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void signInWithOAuth("google")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue with Google
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void signInWithOAuth("apple")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue with Apple
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" ? (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Name<span className="text-red-600"> *</span>
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Email{mode === "signup" ? <span className="text-red-600"> *</span> : null}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="email"
                required
              />
            </div>

            {/* Role + Phone dropped from the signup modal — agents capture
                those (and license / brokerage) via AgentSignupForm on the
                dedicated /agent-signup path. Consumer signup stays minimal
                (name / email / password) to protect conversion. */}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Password{mode === "signup" ? <span className="text-red-600"> *</span> : null}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
              {mode === "login" ? (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={loading || resetSending}
                    className="text-left text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
                  >
                    {resetSending ? "Sending…" : "Email me a reset link"}
                  </button>
                  <Link
                    href="/forgot-password"
                    onClick={() => onClose()}
                    className="text-xs font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                  >
                    Forgot password?
                  </Link>
                </div>
              ) : null}
            </div>

            {resetNotice ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-900">
                {resetNotice}
              </p>
            ) : null}

            {error ? (
              <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? mode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : mode === "login"
                ? "Log in"
                : "Create free account"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="w-full inline-flex items-center justify-center rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Not now
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


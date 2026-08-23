"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";
import { SmsConsentNotice, composeConsentVersion } from "@/components/consent/SmsConsentNotice";
import { useSignupProfilePrefill, type SignupPrefillConsumer } from "@/lib/hooks/useSignupProfilePrefill";
import { safeInternalRedirect } from "@/lib/loginUrl";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOAuthRedirectOrigin } from "@/lib/siteUrl";
import { formatUsPhoneInput, formatUsPhoneStored, isValidUsPhone } from "@/lib/usPhone";
import {
  readSignupAttribution,
  clearSignupAttribution,
} from "@/components/attribution/AttributionCapture";
import { consumeStashedReferralCode } from "@/components/referrals/ReferralCodeCapture";
import { evaluatePassword, PasswordStrength } from "@/components/auth/PasswordStrength";
import { LoadingText } from "@/components/ui/LoadingText";

// BCP-47 base ids shown on the SMS opt-in disclosure. Keep in sync with
// the POSTs to /api/consent/sms — the `sms_consent_version` string must
// describe the exact set of disclosures the user saw.
const CONSENT_LANGUAGES = ["en", "zh"] as const;

function SignupForm() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAgentSignup } = useAuth();
  const { values: prefill, hasSession, loading: prefillLoading } = useSignupProfilePrefill("consumer");
  const pv = prefill as SignupPrefillConsumer;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // TCPA consent — required before SMS can be sent to this number. Default
  // off; we enforce the "unchecked by default" requirement of 47 CFR 64.1200
  // and block form submission when phone is filled but this is unchecked.
  // TODO(db): once user_profiles has `sms_consent_accepted_at`, persist the
  // timestamp + IP here so we have a defensible consent audit trail.
  const [smsConsent, setSmsConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (prefillLoading) return;
    setFullName(pv.fullName);
    setEmail(pv.email);
    setPhone(pv.phone ? formatUsPhoneInput(pv.phone) : "");
  }, [prefillLoading, pv]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim()) return setError(t("pages.signupPage.nameRequired"));
    if (!email.trim()) return setError(t("pages.signupPage.emailRequired"));
    if (phone.trim() && !isValidUsPhone(phone)) {
      return setError(t("pages.signupPage.phoneInvalid"));
    }
    // TCPA §227 + FCC rules: no SMS without prior express consent. Block the
    // submission if the user filled in a phone but did not check the
    // consent box. Leaving phone empty skips this check.
    if (phone.trim() && !smsConsent) {
      return setError(t("pages.signupPage.smsConsentRequired"));
    }

    // First-touch signup source (utm/referrer/landing) — stamped onto the
    // profile so consumer signups are attributable too. Cleared on success.
    const attribution = readSignupAttribution();
    const attrPatch = attribution ? { signup_attribution: attribution } : {};

    if (hasSession) {
      setLoading(true);
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) throw new Error(t("pages.signupPage.sessionExpired"));

        const phoneVal = phone.trim() ? formatUsPhoneStored(phone) : null;
        const { error: upProfErr } = await supabase.from("user_profiles").upsert(
          {
            user_id: user.id,
            full_name: fullName.trim(),
            phone: phoneVal,
            ...attrPatch,
          },
          { onConflict: "user_id" }
        );
        if (upProfErr) {
          const msg = String(upProfErr?.message ?? "");
          const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(msg);
          if (!missingUserId) throw upProfErr;
        }
        const { error: upsertErr } = await supabase.from("leadsmart_users").upsert(
          { user_id: user.id, role: "user" },
          { onConflict: "user_id" }
        );
        if (upsertErr) {
          const msg = String(upsertErr?.message ?? "");
          const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(msg);
          if (!missingUserId) throw upsertErr;
        }
        const { error: ptErr } = await supabase.from("propertytools_users").upsert(
          { user_id: user.id, tier: "basic" },
          { onConflict: "user_id" }
        );
        if (ptErr) {
          const msg = String(ptErr?.message ?? "");
          const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(msg);
          if (!missingUserId) throw ptErr;
        }

        // Same TCPA persistence as the signup branch below — fire-and-forget.
        if (smsConsent && phone.trim()) {
          void fetch("/api/consent/sms", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            // `composeConsentVersion` joins per-locale version strings
          // from the registry (e.g. "en-1+zh-1"). Stamping the exact
          // composite string lets auditors identify which disclosure
          // set a given user saw.
          body: JSON.stringify({ version: composeConsentVersion(CONSENT_LANGUAGES) }),
          }).catch(() => {});
        }

        clearSignupAttribution();
        const after = safeInternalRedirect(searchParams?.get("redirect") ?? null);
        openAgentSignup({ fullName: fullName.trim(), email: email.trim() });
        router.push(after ?? "/");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        setError(msg || t("pages.signupPage.couldNotSaveProfile"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!evaluatePassword(password).allMet) {
      return setError(t("pages.signupPage.passwordRequirements"));
    }
    if (!acceptTerms) {
      return setError(t("pages.signupPage.acceptTerms"));
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (signUpErr) throw signUpErr;
      const userId = data?.user?.id;
      if (!userId) {
        setSuccess(t("pages.signupPage.confirmEmailThenLogIn"));
        return;
      }

      const phoneVal = phone.trim() ? formatUsPhoneStored(phone) : null;
      const { error: upProfErr1 } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName.trim(),
          phone: phoneVal,
          ...attrPatch,
        },
        { onConflict: "user_id" }
      );

      if (upProfErr1) {
        const msg = String(upProfErr1?.message ?? "");
        const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(
          msg
        );

        if (!missingUserId) {
          throw upProfErr1;
        }
      }

      const { error: upsertErr1 } = await supabase.from("leadsmart_users").upsert(
        { user_id: userId, role: "user" },
        { onConflict: "user_id" }
      );

      if (upsertErr1) {
        const msg = String(upsertErr1?.message ?? "");
        const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(
          msg
        );

        if (!missingUserId) {
          throw upsertErr1;
        }
      }

      const { error: ptErr1 } = await supabase.from("propertytools_users").upsert(
        { user_id: userId, tier: "basic" },
        { onConflict: "user_id" }
      );

      if (ptErr1) {
        const msg = String(ptErr1?.message ?? "");
        const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(
          msg
        );

        if (!missingUserId) {
          throw ptErr1;
        }
      }

      // TCPA audit: persist consent via the server endpoint so the IP +
      // user-agent are captured server-side. Fire-and-forget — if this fails
      // we still want the signup to succeed (the UI already validated that
      // the checkbox was ticked; the DB record is defense-in-depth).
      if (smsConsent && phone.trim()) {
        void fetch("/api/consent/sms", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // `composeConsentVersion` joins per-locale version strings
          // from the registry (e.g. "en-1+zh-1"). Stamping the exact
          // composite string lets auditors identify which disclosure
          // set a given user saw.
          body: JSON.stringify({ version: composeConsentVersion(CONSENT_LANGUAGES) }),
        }).catch(() => {});
      }

      clearSignupAttribution();

      // Redeem a stashed ?ref= referral on the email/password path too (was
      // previously only handled on the OAuth complete-profile flow).
      const refCode = consumeStashedReferralCode();
      if (refCode) {
        try {
          await fetch("/api/referrals/redeem", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: refCode }),
          });
        } catch (referralErr) {
          console.warn("referral redemption failed:", referralErr);
        }
      }

      openAgentSignup({ fullName: fullName.trim(), email: email.trim() });
      router.push("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (/rate limit|too many requests/i.test(msg) || /confirmation email|confirm email/i.test(msg)) {
        console.error(
          `[signup] ${msg} In Supabase: Auth → turn off “Confirm email” for dev, or add custom SMTP ` +
            "for production, and confirm the sender domain is verified. Project email rate limits apply."
        );
        setError(t("pages.signupPage.emailSendFailed"));
      } else {
        setError(msg || t("pages.signupPage.signupFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const nextPath = safeInternalRedirect(searchParams?.get("redirect") ?? null) ?? "/";
      const origin = getOAuthRedirectOrigin();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}&provider=${provider}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("pages.signupPage.signInFailed"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        {hasSession ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-[11px] font-medium text-sky-950">{t("pages.signupPage.prefilled")}</p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.articleChrome.name")}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={prefillLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.articleChrome.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              readOnly={hasSession}
              title={hasSession ? t("pages.signupPage.emailTiedToAccount") : undefined}
              disabled={prefillLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.articleChrome.phone")}</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))}
              placeholder="(Optional) Get instant alerts via SMS"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={prefillLoading}
            />
          </div>
          {phone.trim() ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
              />
              {/* Bilingual TCPA disclosure — FCC wants consent copy in
                  the recipient's language, and we don't know that at
                  form render. Both languages stacked keeps us covered
                  for the mainland-Chinese-origin segment that LeadSmart
                  targets without splitting the flow. */}
              <SmsConsentNotice languages={CONSENT_LANGUAGES} />
            </label>
          ) : null}
          {!hasSession ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">{t("pages.signupPage.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={!hasSession}
                disabled={prefillLoading}
                autoComplete="new-password"
              />
              <PasswordStrength password={password} />
            </div>
          ) : null}

          {error ? (
            <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">{error}</p>
          ) : null}
          {success ? (
            <p className="text-[11px] text-emerald-700 font-medium whitespace-pre-line">{success}</p>
          ) : null}

          {/*
           * Explicit consent — TVR-011 / BF-031. Required for CCPA + GDPR +
           * general consumer protection. An active checkbox recorded before
           * account creation; suppressed in profile-completion mode (already
           * signed in) since they accepted at original signup.
           */}
          {hasSession ? null : (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
              />
              <span className="text-[11px] leading-relaxed text-slate-600">{t("pages.signupPage.iAgree")}{" "}
                <Link href="/terms" className="font-medium text-slate-700 underline hover:text-slate-900">{t("pages.articleChrome.termsOfService")}</Link>{" "}
                {t("common:conjunctions.and")}{" "}
                <Link href="/privacy" className="font-medium text-slate-700 underline hover:text-slate-900">{t("pages.articleChrome.privacyPolicy")}</Link>
                .
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              prefillLoading ||
              (!hasSession && (!evaluatePassword(password).allMet || !acceptTerms))
            }
            className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? hasSession
                ? t("pages.signupPage.saving")
                : t("pages.signupPage.creatingAccount")
              : hasSession
              ? t("pages.signupPage.saveProfile")
              : t("pages.signupPage.signUp")}
          </button>
        </form>

        {!hasSession ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">or</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="space-y-2">
              <button
                type="button"
                disabled={loading || prefillLoading}
                onClick={() => void handleOAuth("google")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >{t("pages.signupPage.continueGoogle")}</button>
              <button
                type="button"
                disabled={loading || prefillLoading}
                onClick={() => void handleOAuth("apple")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              >{t("pages.signupPage.continueApple")}</button>
            </div>
          </>
        ) : null}

        <p className="text-[11px] text-gray-500 text-center space-y-2">
          {hasSession ? (
            <>
              <span className="block">
                <Link href="/dashboard" className="text-blue-700 font-semibold">{t("pages.signupPage.goToDashboard")}</Link>
                {" · "}
                <Link href="/agent-signup" className="text-blue-700 font-semibold">{t("pages.signupPage.startAgentSetup")}</Link>
              </span>
            </>
          ) : (
            <>{t("pages.signupPage.alreadyHaveAccount")}{" "}
              <a className="text-blue-700 font-semibold" href="/login">{t("pages.signupPage.logIn")}</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">
          <LoadingText />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useSignupProfilePrefill,
  type SignupOverlayPrefill,
  type SignupPrefillAgent,
} from "@/lib/hooks/useSignupProfilePrefill";
import { safeInternalRedirect } from "@/lib/loginUrl";
import { messageFromUnknownError } from "@/lib/supabaseThrow";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { START_FREE_AS_AGENT_LABEL } from "@/lib/auth/startFreeAgentMarketing";
import { formatUsPhoneInput, formatUsPhoneStored, isValidUsPhone } from "@/lib/usPhone";
import { ADMIN_SUPPORT_HOME_PATH, isAdminOrSupportRole } from "@/lib/rolePortalPaths";
import {
  readSignupAttribution,
  clearSignupAttribution,
} from "@/components/attribution/AttributionCapture";
import { consumeStashedReferralCode } from "@/components/referrals/ReferralCodeCapture";
import { evaluatePassword, PasswordStrength } from "@/components/auth/PasswordStrength";

/** Matches `leadsmart_users.role` for this onboarding form. */
type AgentSignupAccountType = "agent" | "loan_broker";

type AgentSignupFormProps = {
  /** Full page vs compact card (dialog). */
  layout?: "page" | "dialog";
  /** When opened from a dialog, merge name/email before URL/session. */
  overlayPrefill?: SignupOverlayPrefill | null;
  onClose?: () => void;
  /** Called after successful agent setup before navigation (e.g. close dialog). */
  onSuccess?: () => void;
};

export function AgentSignupForm({
  layout = "page",
  overlayPrefill = null,
  onClose,
  onSuccess,
}: AgentSignupFormProps) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect") ?? null;
  const { values: prefill, hasSession, loading: prefillLoading } = useSignupProfilePrefill(
    "agent",
    overlayPrefill
  );
  const pv = prefill as SignupPrefillAgent;

  /** Big callout only when we’re clearly in a “finish setup” flow (dashboard gate or modal), not casual browsing while signed in. */
  const showSignedInPrefillBanner =
    hasSession &&
    !prefillLoading &&
    (Boolean(safeInternalRedirect(redirectParam)) || layout === "dialog");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AgentSignupAccountType>("agent");
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (prefillLoading) return;
    setFullName(pv.fullName);
    setPhone(pv.phone ? formatUsPhoneInput(pv.phone) : "");
    setLicenseNumber(pv.licenseNumber);
    setBrokerage(pv.brokerage);
    setEmail(pv.email);
  }, [prefillLoading, pv]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /** `undefined` = still loading /api/me for signed-in users (avoid flashing "Complete agent setup"). */
  const [meRole, setMeRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!hasSession || prefillLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch("/api/me", {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = (await res.json().catch(() => ({}))) as { role?: string | null };
        if (cancelled) return;
        setMeRole(typeof json.role === "string" ? json.role : null);
      } catch {
        if (!cancelled) setMeRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession, prefillLoading]);

  useEffect(() => {
    if (!hasSession || prefillLoading || meRole === undefined) return;
    if (isAdminOrSupportRole(meRole)) {
      router.replace(ADMIN_SUPPORT_HOME_PATH);
    }
  }, [hasSession, prefillLoading, meRole, router]);

  useEffect(() => {
    if (meRole === "agent" || meRole === "loan_broker") {
      setAccountType(meRole);
    }
  }, [meRole]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim()) return setError("Name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (!phone.trim()) return setError("Phone is required for agent onboarding.");
    if (!isValidUsPhone(phone)) {
      return setError("Phone must be a valid US number (10 digits).");
    }
    if (!hasSession && !evaluatePassword(password).allMet) {
      return setError("Please choose a password that meets all the requirements below.");
    }
    if (!hasSession && !acceptTerms) {
      return setError("Please accept the Terms of Service and Privacy Policy to continue.");
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const phoneStored = formatUsPhoneStored(phone)!;
      // First-touch signup source (utm/referrer/landing), stamped onto the new
      // account so we can tell where signups come from. Read (not cleared) here;
      // cleared only after a successful account write.
      const attribution = readSignupAttribution();
      const attrPatch = attribution ? { signup_attribution: attribution } : {};

      if (hasSession) {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) throw new Error("Session expired. Please log in again.");

        const { error: upProfErr } = await supabase.from("user_profiles").upsert(
          {
            user_id: user.id,
            full_name: fullName.trim(),
            phone: phoneStored,
          },
          { onConflict: "user_id" }
        );
        if (upProfErr) {
          const msg = String(upProfErr?.message ?? "");
          const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(msg);
          if (!missingUserId) throw upProfErr;
        }
        const { error: upsertUserErr1 } = await supabase.from("leadsmart_users").upsert(
          {
            user_id: user.id,
            role: accountType,
            license_number: licenseNumber.trim() || null,
            brokerage: brokerage.trim() || null,
          },
          { onConflict: "user_id" }
        );
        if (upsertUserErr1) {
          const msg = String(upsertUserErr1?.message ?? "");
          const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(msg);
          if (!missingUserId) throw upsertUserErr1;
        }

        const { error: upsertAgentErr } = await supabase.from("agents").upsert(
          {
            auth_user_id: user.id,
            plan_type: "free",
            ...attrPatch,
          } as Record<string, unknown>,
          { onConflict: "auth_user_id" }
        );
        if (upsertAgentErr) throw upsertAgentErr;

        clearSignupAttribution();
        onSuccess?.();
        const after = safeInternalRedirect(redirectParam);
        router.push(after ?? "/dashboard");
        onClose?.();
        return;
      }

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
        setSuccess("Check your email to confirm your account, then log in to access the dashboard.");
        return;
      }

      const { error: upProfErr } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName.trim(),
          phone: phoneStored,
        },
        { onConflict: "user_id" }
      );
      if (upProfErr) {
        const msg = String(upProfErr?.message ?? "");
        const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(
          msg
        );

        if (!missingUserId) {
          throw upProfErr;
        }
      }
      const { error: upsertUserErr1 } = await supabase.from("leadsmart_users").upsert(
        {
          user_id: userId,
          role: accountType,
          license_number: licenseNumber.trim() || null,
          brokerage: brokerage.trim() || null,
        },
        { onConflict: "user_id" }
      );
      if (upsertUserErr1) {
        const msg = String(upsertUserErr1?.message ?? "");
        const missingUserId = /user_id.*does not exist|column\s+.*user_id.*does not exist/i.test(
          msg
        );

        if (!missingUserId) {
          throw upsertUserErr1;
        }
      }

      const { error: upsertAgentErr } = await supabase.from("agents").upsert(
        {
          auth_user_id: userId,
          plan_type: "free",
          ...attrPatch,
        } as Record<string, unknown>,
        { onConflict: "auth_user_id" }
      );
      if (upsertAgentErr) throw upsertAgentErr;

      clearSignupAttribution();

      // Redeem a stashed ?ref= referral. Until now this only happened on the
      // OAuth complete-profile path, so email/password signups silently dropped
      // the referrer's bonus. Best-effort — never blocks onboarding.
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

      onSuccess?.();
      const after = safeInternalRedirect(redirectParam);
      router.push(after ?? "/dashboard");
      onClose?.();
    } catch (e: unknown) {
      const msg = messageFromUnknownError(e, "Agent signup failed.");
      if (/rate limit|too many requests/i.test(msg)) {
        setError(
          "Too many emails sent. Wait before retrying, or in Supabase Dashboard → Authentication → Providers → Email: disable “Confirm email” while testing, or connect custom SMTP."
        );
      } else if (/confirmation email|confirm email/i.test(msg)) {
        setError(
          "Supabase couldn’t send the confirmation email. For local testing, disable email confirmations in Supabase Dashboard (Authentication → Email/Providers → turn off Confirm email). If you want emails, check Supabase SMTP/Resend settings and that the sender domain is verified."
        );
      } else {
        setError(msg || "Agent signup failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  const staffUser = hasSession && meRole !== undefined && isAdminOrSupportRole(meRole);
  const awaitingRole = hasSession && !prefillLoading && meRole === undefined;
  if (prefillLoading || awaitingRole || staffUser) {
    const label = staffUser ? "Redirecting…" : "Loading…";
    if (layout === "page") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <p className="text-sm text-gray-600">{label}</p>
        </div>
      );
    }
    return (
      <div className="w-full max-w-sm space-y-5 p-6 text-center">
        <p className="text-sm text-gray-600">{label}</p>
      </div>
    );
  }

  const signedInAgentFlow = hasSession && !isAdminOrSupportRole(meRole);

  const inner = (
    <div
      className={
        layout === "page"
          ? "w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5"
          : "w-full max-w-sm space-y-5"
      }
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-bold text-gray-900">
          {signedInAgentFlow ? "Complete agent setup" : START_FREE_AS_AGENT_LABEL}
        </h1>
        <p className="text-xs text-gray-600">{t("pages.agentSignup.intro")}</p>
        {showSignedInPrefillBanner && signedInAgentFlow ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-medium text-sky-950">{t("pages.agentSignup.signedInPrefilled")}</p>
        ) : signedInAgentFlow ? (
          <p className="text-[11px] text-gray-500">{t("pages.agentSignup.signedInNoPassword")}</p>
        ) : null}
        <p className="pt-2 text-[11px] text-gray-500">
          Prefer a 2-minute interactive preview first?{" "}
          <Link
            href="/onboarding"
            className="font-semibold text-blue-700 hover:underline"
            onClick={() => onClose?.()}
          >{t("pages.agentSignup.guidedOnboarding")}</Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.accountType")}</legend>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="accountType"
                checked={accountType === "agent"}
                onChange={() => setAccountType("agent")}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />{t("pages.agentSignup.realEstateAgent")}</label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="accountType"
                checked={accountType === "loan_broker"}
                onChange={() => setAccountType("loan_broker")}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />{t("pages.agentSignup.loanBroker")}</label>
          </div>
        </fieldset>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.name")}<span className="text-red-600"> *</span>
          </label>
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
          <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.phone")}<span className="text-red-600"> *</span>
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))}
            placeholder={t("pages.agentSignup.phoneHint")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={prefillLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.license")}</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={prefillLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.brokerage")}</label>
          <input
            type="text"
            value={brokerage}
            onChange={(e) => setBrokerage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={prefillLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.email")}<span className="text-red-600"> *</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            readOnly={signedInAgentFlow}
            title={signedInAgentFlow ? "Email is tied to your signed-in account" : undefined}
            disabled={prefillLoading}
          />
        </div>

        {!signedInAgentFlow ? (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">{t("pages.agentSignup.password")}<span className="text-red-600"> *</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required={!signedInAgentFlow}
              autoComplete="new-password"
              disabled={prefillLoading}
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
         * Explicit consent — TVR-011 / BF-031. An active checkbox (not just
         * passive copy) recorded before account creation; suppressed for the
         * signed-in profile-completion flow since they accepted at signup.
         */}
        {signedInAgentFlow ? null : (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
            />
            <span className="text-[11px] leading-relaxed text-slate-600">
              I agree to the{" "}
              <Link href="/terms" className="font-medium text-slate-700 underline hover:text-slate-900">{t("pages.agentSignup.terms")}</Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-slate-700 underline hover:text-slate-900">{t("pages.agentSignup.privacy")}</Link>
              .
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={
            loading ||
            prefillLoading ||
            (!signedInAgentFlow && (!evaluatePassword(password).allMet || !acceptTerms))
          }
          className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Saving…" : signedInAgentFlow ? "Save agent profile" : "Create Agent Account"}
        </button>
      </form>

      <p className="text-[11px] text-gray-500 text-center">
        Prefer regular user signup?{" "}
        <a className="text-blue-700 font-semibold" href="/signup" onClick={() => onClose?.()}>{t("pages.agentSignup.signUpHere")}</a>
      </p>
    </div>
  );

  if (layout === "page") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">{inner}</div>
    );
  }

  return inner;
}

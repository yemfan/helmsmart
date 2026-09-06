"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { estimateHomeValue } from "@/lib/property";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useAuth } from "@/components/AuthProvider";
import { signOutWithFullReload } from "@/lib/auth/signOutClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  LOGGED_IN_GET_AGENT_ACCESS_LABEL,
  START_FREE_AS_AGENT_LABEL,
} from "@/lib/auth/startFreeAgentMarketing";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAgentSignup } = useAuth();
  const [agent, setAgent] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [showEstimate, setShowEstimate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mortgageLoading, setMortgageLoading] = useState(false);
  const [mortgageError, setMortgageError] = useState<string | null>(null);
  const [mortgageResult, setMortgageResult] = useState<number | null>(null);
  const [mortgageHomePrice, setMortgageHomePrice] = useState<number>(300000);

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState<"agent" | "user" | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);


  async function handleLogout() {
    setIsAuthed(false);
    setUserRole(null);
    await signOutWithFullReload("/");
  }

  async function handleStartFreeAsAgent() {
    setUpgradeError(null);
    setUpgradeMessage(null);

    // If not logged in, open agent signup in a modeless panel (same pattern as login modal).
    if (!isAuthed) {
      openAgentSignup({
        email: email.trim() || undefined,
        fullName: name.trim() || undefined,
      });
      return;
    }

    // Safety: agents already have access; send them to the dashboard.
    if (userRole === "agent") {
      router.replace("/dashboard");
      return;
    }

    // Only non-agents should reach the upgrade flow.
    if (userRole !== "user") return;

    const nameTrim = name.trim();
    const phoneTrim = phone.trim();
    if (!nameTrim) {
      setUpgradeError("Please enter your full name to continue as an agent.");
      return;
    }
    if (!phoneTrim || phoneTrim.replace(/\D/g, "").length !== 10) {
      setUpgradeError("Please enter a valid 10-digit US phone number.");
      return;
    }

    setUpgradeLoading(true);
    try {
      // Supabase SSR cookie session might not be available for this route.
      // Pass the current access token explicitly for auth.
      const supabase = supabaseBrowser();
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw new Error(sessionErr.message ?? "Not authenticated.");
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated.");

      const res = await fetch("/api/upgrade-to-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ full_name: nameTrim, phone: phoneTrim }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? json?.message ?? "Upgrade failed.");
      }

      if (json?.upgraded) {
        setUpgradeMessage("🎉 You're now an Agent! Welcome to your dashboard.");
      }
      // Let the user briefly see the success message.
      setTimeout(() => router.replace("/dashboard"), 800);
    } catch (e: any) {
      setUpgradeError(e?.message ?? "Upgrade failed.");
    } finally {
      setUpgradeLoading(false);
    }
  }

  useEffect(() => {
    const addr = searchParams?.get("address");
    const ag = searchParams?.get("agent");
    const src = searchParams?.get("source");
    if (addr) setAddress(addr);
    if (ag) setAgent(ag);
    if (src) setSource(src);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAuthLoading(true);
      try {
        const supabase = supabaseBrowser();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;

        if (!user) {
          if (cancelled) return;
          setIsAuthed(false);
          setUserRole(null);
          return;
        }

        // Prefer `public.users.role` for role detection.
        let role: "agent" | "user" = "user";
        try {
          const missingUserId = (err: any) => {
            const msg = String(err?.message ?? "");
            return (
              /user_id.*does not exist/i.test(msg) ||
              /column\s+.*user_id.*does not exist/i.test(msg)
            );
          };

          let userRow: any = null;
          let userRowErr: any = null;
          ({ data: userRow, error: userRowErr } = await supabase
            .from("leadsmart_users")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle());

          if (userRowErr && missingUserId(userRowErr)) {
            userRowErr = null;
          }

          const rawRole = (userRow as any)?.role;
          if (!userRowErr && (rawRole === "agent" || rawRole === "user")) {
            role = rawRole;
          } else {
            // Fallback: if there is an agent record, treat as agent.
            const { data: agentRow } = await supabase
              .from("agents")
              .select("id")
              .eq("auth_user_id", user.id)
              .maybeSingle();
            role = agentRow ? "agent" : "user";
          }
        } catch {
          // If `public.users` doesn't exist yet / can't be read, fallback to `agents`.
          const { data: agentRow } = await supabase
            .from("agents")
            .select("id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          role = agentRow ? "agent" : "user";
        }

        if (cancelled) return;
        setIsAuthed(true);
        setUserRole(role);

        // Keep homepage accessible for everyone; don't auto-redirect agents to dashboard.
        // This avoids redirect loops when client auth exists but server cookies are missing.
      } catch (e) {
        console.error("Role check failed", e);
        if (cancelled) return;
        setIsAuthed(false);
        setUserRole(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const estimate = useMemo(
    () => (showEstimate && address.trim() ? estimateHomeValue(address.trim()) : null),
    [showEstimate, address]
  );

  async function handleCheckValue() {
    setError(null);
    if (!address.trim()) {
      setError("Please enter a property address.");
      return;
    }

    // Marketplace tracking: log estimator "view" for opportunity generation.
    // Best-effort: do not block UI on failures.
    try {
      const preview = estimateHomeValue(address.trim());
      await fetch("/api/tool-usage/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tool_name: "estimator",
          property_address: address.trim(),
          action: "view",
          estimated_value: preview.value,
        }),
      });
    } catch {}

    setShowEstimate(true);
  }

  async function handleMortgageQuote() {
    setMortgageError(null);
    setMortgageResult(null);

    const addr = address.trim();
    if (!addr) {
      setMortgageError("Please enter a property address.");
      return;
    }

    const homePrice = Number(mortgageHomePrice);
    if (!Number.isFinite(homePrice) || homePrice <= 0) {
      setMortgageError("Please enter a valid home price.");
      return;
    }

    setMortgageLoading(true);
    try {
      const res = await fetch("/api/mortgage-rate/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: addr,
          homePrice,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to get mortgage rate.");
      }

      const payment = Number(json?.monthlyPayment ?? json?.payment ?? json?.result ?? 0);
      setMortgageResult(Number.isFinite(payment) ? payment : null);
    } catch (e: any) {
      setMortgageError(e?.message ?? "Something went wrong.");
    } finally {
      setMortgageLoading(false);
    }
  }

  async function handleSubmitLead(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email so the agent can follow up.");
      return;
    }
    if (!address.trim()) {
      setError("Please enter a property address.");
      return;
    }
    if (smsConsent && !phone.trim()) {
      setError("Please add a phone number to receive SMS, or untick SMS consent.");
      return;
    }

    // Marketplace tracking: log estimator "submit" when the user requests the full report.
    try {
      const preview = estimateHomeValue(address.trim());
      await fetch("/api/tool-usage/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tool_name: "estimator",
          property_address: address.trim(),
          action: "submit",
          estimated_value: preview.value,
        }),
      });
    } catch {}

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          address: address.trim(),
          agent: agent || undefined,
          source: source || "landing",
          smsConsent,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to submit your request.");
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-50 bg-slate-50/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">CloseBoss</div>
            <div className="text-xs text-slate-500 truncate">
              {isAuthed && userRole ? `Signed in as ${userRole}` : t("pages.homeValueFunnel.homeValueFunnelsCrm")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authLoading ? (
              <span className="text-xs text-slate-500">{t("pages.homeValueFunnel.checkingSession")}</span>
            ) : null}

            {!authLoading && (!isAuthed || userRole !== "agent") ? (
              <Link
                href="/plans"
                className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
              >{t("pages.homeValueFunnel.upgrade")}</Link>
            ) : null}

            {!authLoading && !isAuthed ? (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                >{t("pages.homeValueFunnel.login")}</Link>
                <Link
                  href="/signup"
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >{t("pages.homeValueFunnel.signUp")}</Link>
              </>
            ) : null}

            {isAuthed ? (
              <>
                {userRole === "agent" ? (
                  <Link
                    href="/dashboard"
                    className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >{t("pages.homeValueFunnel.dashboard")}</Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartFreeAsAgent}
                    disabled={upgradeLoading}
                    className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {upgradeLoading ? t("common:status.upgrading") : LOGGED_IN_GET_AGENT_ACCESS_LABEL}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                >{t("pages.homeValueFunnel.logout")}</button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {!authLoading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{t("pages.homeValueFunnel.needMore")}</div>
              <div className="text-xs text-slate-600 mt-1">{t("pages.homeValueFunnel.needMoreBody")}</div>
            </div>
            <Link
              href="/plans"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              🚀 {t("pages.homeValueFunnel.upgrade")}
            </Link>
          </div>
        ) : null}

        {!authLoading && userRole !== "agent" ? (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center space-y-2">
            <h2 className="text-xl font-bold text-blue-900">{t("pages.homeValueFunnel.areYouAgent")}</h2>
            <p className="text-sm text-blue-900/80">{t("pages.homeValueFunnel.tryFree")}</p>
            {upgradeMessage ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2 text-sm">
                {upgradeMessage}
              </div>
            ) : null}
            {upgradeError ? (
              <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">{upgradeError}</p>
            ) : null}

            <button
              type="button"
              onClick={handleStartFreeAsAgent}
              disabled={upgradeLoading}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {upgradeLoading
                ? t("common:status.upgrading")
                : isAuthed
                  ? LOGGED_IN_GET_AGENT_ACCESS_LABEL
                  : START_FREE_AS_AGENT_LABEL}
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >{t("pages.homeValueFunnel.seePricing")}</Link>
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{t("pages.homeValueFunnel.forAgents")}</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t("pages.homeValueFunnel.heroTitle")}</h1>
              <p className="text-sm sm:text-base text-slate-600">{t("pages.homeValueFunnel.heroBody")}</p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">{t("pages.homeValueFunnel.startWithAddress")}</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(v) => {
                    setAddress(v.formattedAddress);
                    setAddressLat(v.lat);
                    setAddressLng(v.lng);
                  }}
                  placeholder="123 Main St, City, State"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleCheckValue}
                  className="inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700"
                >{t("pages.homeValueFunnel.checkMyValue")}</button>
              </div>
              {error && (
                <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">
                  {error}
                </p>
              )}
            </div>

            {estimate && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.homeValueFunnel.instantEstimate")}</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {estimate.displayValue}
                    </p>
                    <p className="text-xs text-slate-500">{t("pages.homeValueFunnel.estimatedRange")} {estimate.displayLow} – {estimate.displayHigh}
                    </p>
                  </div>
                  <div className="text-xs text-slate-600 max-w-xs">{t("pages.homeValueFunnel.estimateNote")}</div>
                </div>

                <div className="bg-slate-900 text-slate-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold">{t("pages.homeValueFunnel.reportLocked")}</p>
                  <p className="text-[11px] text-slate-300">{t("pages.homeValueFunnel.reportLockedBody")}</p>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{t("pages.homeValueFunnel.getRate")}</h2>
                <p className="text-xs text-slate-600 mt-1">{t("pages.homeValueFunnel.getRateBody")}</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Estimated home price ($)
                </label>
                <input
                  type="number"
                  value={mortgageHomePrice}
                  onChange={(e) => setMortgageHomePrice(Number(e.target.value))}
                  min={0}
                  step={1000}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="300000"
                />
              </div>

              <button
                type="button"
                disabled={!address.trim() || mortgageLoading}
                onClick={handleMortgageQuote}
                className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {mortgageLoading ? t("common:status.checking") : t("pages.homeValueFunnel.getMortgageRate")}
              </button>

              {mortgageResult != null ? (
                <p className="text-xs text-slate-700">{t("pages.homeValueFunnel.estimatedPayment")}{" "}
                  <span className="font-semibold">
                    ${Math.round(mortgageResult).toLocaleString()}/mo
                  </span>
                </p>
              ) : null}

              {mortgageError ? (
                <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">
                  {mortgageError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{t("pages.homeValueFunnel.unlockTitle")}</h2>
                <p className="text-xs text-slate-600">{t("pages.homeValueFunnel.unlockBody")}</p>
              </div>

              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">{t("pages.homeValueFunnel.thankYou")}</div>
              ) : (
                <form onSubmit={handleSubmitLead} className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">{t("pages.articleChrome.name")}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("pages.homeValueFunnel.yourName")}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">{t("pages.articleChrome.email")}</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">{t("pages.homeValueFunnel.phoneOptional")}</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* SMS opt-in — Twilio TFV / A2P 10DLC proof-of-consent
                      surface. Wording mirrors /contact and /open-house-signup
                      (see lib/consent/disclosureVersions.ts). Do not edit
                      without bumping HOME_VALUE_FUNNEL_DISCLOSURE_VERSION. */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <label
                      htmlFor="hvf-sms-consent"
                      className="flex cursor-pointer items-start gap-3"
                    >
                      <input
                        id="hvf-sms-consent"
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => setSmsConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">{t("pages.homeValueFunnel.smsConsent")}</span>{" "}{t("pages.homeValueFunnel.smsConsentBody")}{" "}
                        <strong>CloseBoss</strong> {t("pages.homeValueFunnel.smsConsentTail")}</span>
                    </label>
                    <p className="mt-2 pl-7 text-[11px] leading-relaxed text-slate-500">{t("pages.homeValueFunnel.smsRates")} <strong>{t("pages.homeValueFunnel.stop")}</strong> {t("pages.homeValueFunnel.toOptOut")}{" "}
                      <strong>{t("pages.homeValueFunnel.help")}</strong> {t("pages.homeValueFunnel.forHelp")}{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >{t("pages.articleChrome.privacyPolicy")}</a>{" "}
                      {t("common:conjunctions.and")}{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >{t("pages.articleChrome.termsOfService")}</a>{" "}{t("pages.homeValueFunnel.forDetails")}</p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? t("common:status.submitting") : t("pages.homeValueFunnel.sendMeMyFull")}
                  </button>
                </form>
              )}

              <p className="text-[11px] text-slate-400">{t("pages.homeValueFunnel.submitNote")}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-2 text-xs text-slate-700">
              <h3 className="text-sm font-semibold text-slate-900">{t("pages.homeValueFunnel.builtFor")}</h3>
              <p>{t("pages.homeValueFunnel.builtForBody")}</p>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}

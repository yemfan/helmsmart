"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { estimateHomeValue } from "@/lib/property";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import PricingModal from "@/components/PricingModal";
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

  const [pricingModalOpen, setPricingModalOpen] = useState(false);

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
            <div className="text-sm font-semibold text-slate-900 truncate">RealtyBoss</div>
            <div className="text-xs text-slate-500 truncate">
              {isAuthed && userRole ? `Signed in as ${userRole}` : "Home value funnels + CRM"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authLoading ? (
              <span className="text-xs text-slate-500">Checking session...</span>
            ) : null}

            {!authLoading && (!isAuthed || userRole !== "agent") ? (
              <button
                type="button"
                onClick={() => setPricingModalOpen(true)}
                className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
              >
                Upgrade
              </button>
            ) : null}

            {!authLoading && !isAuthed ? (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </>
            ) : null}

            {isAuthed ? (
              <>
                {userRole === "agent" ? (
                  <Link
                    href="/dashboard"
                    className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartFreeAsAgent}
                    disabled={upgradeLoading}
                    className="text-sm font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {upgradeLoading ? "Upgrading..." : LOGGED_IN_GET_AGENT_ACCESS_LABEL}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                >
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {!authLoading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Need more limits?</div>
              <div className="text-xs text-slate-600 mt-1">
                Upgrade to unlock unlimited CMA/lead access and full CRM features.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPricingModalOpen(true)}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              🚀 Upgrade
            </button>
          </div>
        ) : null}

        {!authLoading && userRole !== "agent" ? (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center space-y-2">
            <h2 className="text-xl font-bold text-blue-900">Are you a real estate agent?</h2>
            <p className="text-sm text-blue-900/80">
              Try AI Property Tools and Sales Lead Generation & Management System for FREE
            </p>
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
                ? "Upgrading..."
                : isAuthed
                  ? LOGGED_IN_GET_AGENT_ACCESS_LABEL
                  : START_FREE_AS_AGENT_LABEL}
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              See Pricing
            </Link>
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                RealtyBoss for Agents
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
                Turn home value checks into real listing appointments.
              </h1>
              <p className="text-sm sm:text-base text-slate-600">
                RealtyBoss gives real estate agents a modern home value funnel, automated
                email follow-up, and a simple CRM so you can focus on conversations, not data entry.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Start with a property address
              </label>
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
                >
                  Check My Home Value
                </button>
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Instant Estimate (Preview)
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {estimate.displayValue}
                    </p>
                    <p className="text-xs text-slate-500">
                      Estimated range: {estimate.displayLow} – {estimate.displayHigh}
                    </p>
                  </div>
                  <div className="text-xs text-slate-600 max-w-xs">
                    This is a quick, AI-assisted estimate using recent market data. Enter your
                    email to unlock the full report and have an agent fine-tune the number.
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold">
                    Full report is locked – unlock with your email.
                  </p>
                  <p className="text-[11px] text-slate-300">
                    You&apos;ll see a detailed breakdown, confidence range, and next steps for
                    selling or refinancing. Your info is sent only to the inviting agent.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Get your mortgage rate
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  See an estimated monthly payment for your address.
                </p>
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
                {mortgageLoading ? "Checking..." : "Get Mortgage Rate"}
              </button>

              {mortgageResult != null ? (
                <p className="text-xs text-slate-700">
                  Estimated monthly payment:{" "}
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
                <h2 className="text-sm font-semibold text-slate-900">
                  Unlock your full home value report
                </h2>
                <p className="text-xs text-slate-600">
                  Share a few details so your agent can send a personalized CMA and follow up with
                  options.
                </p>
              </div>

              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                  Thank you! Your request has been sent. Your agent will follow up with a detailed
                  report and next steps.
                </div>
              ) : (
                <form onSubmit={handleSubmitLead} className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Email
                    </label>
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
                    <label className="block text-xs font-medium text-slate-700">
                      Phone (optional)
                    </label>
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
                        <span className="font-semibold text-slate-900">
                          Yes, send me marketing text messages from RealtyBoss.
                        </span>{" "}
                        By checking this box and providing my phone number above, I
                        consent to receive promotional text messages from{" "}
                        <strong>RealtyBoss</strong> about real-estate services,
                        new listings, market updates, and special offers.
                      </span>
                    </label>
                    <p className="mt-2 pl-7 text-[11px] leading-relaxed text-slate-500">
                      Message frequency varies. Message and data rates may apply.
                      Reply <strong>STOP</strong> to opt out at any time, or{" "}
                      <strong>HELP</strong> for help. Consent is not a condition of
                      any purchase. See our{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Privacy Policy
                      </a>{" "}
                      and{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Terms of Service
                      </a>{" "}
                      for details.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting..." : "Send Me My Full Report"}
                  </button>
                </form>
              )}

              <p className="text-[11px] text-slate-400">
                By submitting, you agree to be contacted by your agent about your home value and
                local market conditions. SMS is sent only if you tick the box above. No spam.
                Unsubscribe at any time.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-2 text-xs text-slate-700">
              <h3 className="text-sm font-semibold text-slate-900">
                Built for modern listing agents
              </h3>
              <p>
                RealtyBoss gives you a shareable home value funnel, automated follow-up, and
                a lightweight CRM so you can track every homeowner from first click to signed
                listing agreement.
              </p>
            </div>
          </div>
        </section>
      </main>

        <PricingModal open={pricingModalOpen} onClose={() => setPricingModalOpen(false)} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { BrandCheck } from "@/components/brand/BrandCheck";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CREDIT_TIERS, annualUsd, approxCallMinutes, approxVideos } from "@/lib/credits/pricing";
import { buildDemoLeads, randomIncomingSnippet } from "./demoLeads";
import { clearOnboarding, loadOnboarding, saveOnboarding, stepToProgress } from "./storage";
import type { DemoLead, LeadFocus, OnboardingProfile, OnboardingStep, PriceRangeId } from "./types";
import { LoadingText } from "@/components/ui/LoadingText";

function effectiveProfile(p: Partial<OnboardingProfile>): OnboardingProfile {
  return {
    fullName: p.fullName?.trim() || "Agent",
    email: p.email?.trim() || "demo@preview.local",
    city: p.city?.trim() || "your market",
    focus: p.focus ?? "both",
    priceRangeId: p.priceRangeId ?? "750-1500",
  };
}

function trackOnboardingStep(step: OnboardingStep, label: string) {
  if (typeof window === "undefined") return;
  fetch("/api/growth/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "onboarding_step",
      page_path: "/onboarding",
      source: "onboarding_funnel",
      metadata: { step, label },
    }),
  }).catch(() => {});
}

function ProgressBar({ step }: { step: OnboardingStep }) {
  const { t } = useTranslation("dashboard");
  const pct = stepToProgress(step);
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
        <span>
          {t("pages.onboardingFunnel.stepOfEight", { step })}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="onboarding-shimmer-bar h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, minWidth: step >= 1 ? "4%" : "0" }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">{t("pages.onboardingFunnel.previewBanner")}</p>
    </div>
  );
}

function Shell({
  children,
  step,
  /**
   * Widen the column for steps that lay out a row of cards.
   *
   * Every other step is a single form or panel and reads better narrow, so the
   * default stays. The pricing step has five tiers side by side and needs the
   * room `/plans` already gives them.
   */
  wide = false,
}: {
  children: React.ReactNode;
  step: OnboardingStep;
  wide?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  return (
    /* `relative` matters: the wash below is `absolute inset-0`, and without a
       positioned ancestor it anchors to the body and stops one viewport down,
       leaving a hard horizontal edge partway through a taller step. */
    <div className="relative min-h-screen bg-gray-50 text-gray-900">
      {/* Brand wash. Tuned at 0.25 against near-black; on a white ground that
          reads as a printing error, so it drops to a hint of colour. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,114,206,0.08),transparent)]" />
      <div
        className={`relative mx-auto flex min-h-screen flex-col px-4 py-8 sm:px-6 sm:py-12 ${
          wide ? "max-w-lg sm:max-w-6xl" : "max-w-lg sm:max-w-xl"
        }`}
      >
        <header className="mb-6 flex items-center justify-between gap-3 onboarding-fade-up">
          <Link href="/" className="flex items-center opacity-90 transition hover:opacity-100">
            {/* The dark tone means "drawn FOR a dark background": it paints the
                wordmark white, which on this page is an invisible logo. */}
            <CloseBossLogo compact tone="light" className="max-w-[240px]" />
          </Link>
          <Link
            href="/plans"
            className="text-xs font-semibold text-sky-600 underline-offset-2 hover:text-gray-900 hover:underline"
          >{t("pages.onboardingFunnel.pricing")}</Link>
        </header>
        <ProgressBar step={step} />
        <div className="onboarding-fade-up flex-1">{children}</div>
      </div>
    </div>
  );
}

const FOCUS_OPTIONS: { id: LeadFocus; label: string; hint: string }[] = [
  { id: "buyers", label: "Mostly buyers", hint: "Tour requests & pre-approvals" },
  { id: "sellers", label: "Mostly sellers", hint: "Listings & CMA conversations" },
  { id: "both", label: "Both equally", hint: "Mixed pipeline" },
];

const PRICE_OPTIONS: { id: PriceRangeId; label: string }[] = [
  { id: "under-750", label: "Under ~$750K" },
  { id: "750-1500", label: "$750K – $1.5M" },
  { id: "1500-plus", label: "$1.5M+" },
];

export default function OnboardingFunnel({
  fallback,
}: {
  /**
   * Content to render on the server (and during client-side hydration until
   * localStorage is loaded). Without this, crawlers and slow connections see
   * only a <LoadingText /> stub — see TOM report MJ-003.
   */
  fallback?: React.ReactNode;
} = {}) {
  const { t } = useTranslation("dashboard");
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(1);
  const [profile, setProfile] = useState<Partial<OnboardingProfile>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [onboardingCadence, setOnboardingCadence] = useState<"monthly" | "annual">("monthly");
  const [hasReplied, setHasReplied] = useState(false);
  const [paywallSeen, setPaywallSeen] = useState(false);
  const [engagementPoints, setEngagementPoints] = useState(0);
  const [replyDraft, setReplyDraft] = useState("");
  const [activationLog, setActivationLog] = useState<string[]>([]);
  const [activationDone, setActivationDone] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastId = useRef(0);
  const incomingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const s = loadOnboarding();
    setStep(s.step);
    setProfile(s.profile);
    setSelectedLeadId(s.selectedLeadId);
    setHasReplied(s.hasReplied);
    setPaywallSeen(s.paywallSeen);
    setEngagementPoints(s.engagementPoints);
    setHydrated(true);
  }, []);

  /** If the visitor is already signed in, merge account name/email into step 1 when fields are empty. */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) return;
        const user = session.user;
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        const row = prof as { full_name?: string | null } | null;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
        const authEmail = user.email?.trim() ?? "";
        const fromProfile = row?.full_name?.trim() ?? "";
        const displayName = fromProfile || metaName || (authEmail ? authEmail.split("@")[0] : "");

        setProfile((p) => {
          const hasName = Boolean(p.fullName?.trim());
          const hasEmail = Boolean(p.email?.trim());
          if (hasName && hasEmail) return p;
          return {
            ...p,
            fullName: hasName ? p.fullName : displayName || p.fullName,
            email: hasEmail ? p.email : authEmail || p.email,
          };
        });
      } catch (e) {
        console.error("[OnboardingFunnel] session prefill", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveOnboarding({
      version: 1,
      step,
      profile,
      selectedLeadId,
      hasReplied,
      paywallSeen,
      engagementPoints,
      completedAt: step >= 8 ? new Date().toISOString() : null,
    });
  }, [hydrated, step, profile, selectedLeadId, hasReplied, paywallSeen, engagementPoints]);

  const fullProfile = useMemo(() => effectiveProfile(profile), [profile]);
  const demoLeads = useMemo(() => {
    if (step < 4) return [];
    return buildDemoLeads(fullProfile);
  }, [fullProfile, step]);

  const selectedLead = useMemo(() => {
    if (!demoLeads.length) return null;
    return demoLeads.find((l) => l.id === selectedLeadId) ?? demoLeads[0];
  }, [demoLeads, selectedLeadId]);

  const [thread, setThread] = useState<DemoLead["messages"]>([]);

  useEffect(() => {
    if (selectedLead) setThread([...selectedLead.messages]);
  }, [selectedLead]);

  const go = useCallback(
    (next: OnboardingStep, label: string) => {
      setStep(next);
      trackOnboardingStep(next, label);
    },
    []
  );

  /* Activation simulation */
  useEffect(() => {
    if (step !== 3) return;
    setActivationLog([]);
    setActivationDone(false);
    const lines = [
      `→ Pairing ${fullProfile.city} territory…`,
      "→ Loading AI reply templates…",
      "→ Syncing SMS + portal handoffs…",
      "→ Subscribing to live lead stream…",
      "✓ Pipeline ready — demo leads incoming",
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i < lines.length) {
        setActivationLog((prev) => [...prev, lines[i]]);
        i += 1;
      } else {
        clearInterval(t);
        setActivationDone(true);
      }
    }, 720);
    return () => clearInterval(t);
  }, [step, fullProfile.city]);

  useEffect(() => {
    if (step === 5 && demoLeads.length === 0) {
      setStep(4);
    }
  }, [step, demoLeads.length]);

  /* Fake incoming lead toasts on inbox / detail */
  useEffect(() => {
    if (step !== 4 && step !== 5) {
      if (incomingInterval.current) clearInterval(incomingInterval.current);
      return;
    }
    incomingInterval.current = setInterval(() => {
      toastId.current += 1;
      const id = toastId.current;
      const text = randomIncomingSnippet(fullProfile, id);
      setToasts((prev) => [...prev.slice(-3), { id, text }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5200);
    }, 13000);
    return () => {
      if (incomingInterval.current) clearInterval(incomingInterval.current);
    };
  }, [step, fullProfile]);

  const signupQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (profile.fullName) q.set("fullName", profile.fullName.trim());
    if (profile.email) q.set("email", profile.email.trim());
    q.set("from", "onboarding");
    return q.toString();
  }, [profile.fullName, profile.email]);

  if (!hydrated) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        <LoadingText />
      </div>
    );
  }

  /* ——— Step 1: Signup ——— */
  if (step === 1) {
    return (
      <Shell step={1}>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl backdrop-blur-md sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600">CloseBoss</p>
          <h1 className="mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl">{t("pages.onboardingFunnel.heroTitle")}</h1>
          <p className="mt-3 text-sm text-gray-600">{t("pages.onboardingFunnel.heroSub")}</p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fullName = (profile.fullName ?? "").trim();
              const email = (profile.email ?? "").trim();
              if (!fullName || !email) return;
              setProfile((p) => ({ ...p, fullName, email }));
              go(2, "signup_complete");
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-gray-600">{t("pages.onboardingFunnel.fullName")}</label>
              <input
                name="fullName"
                value={profile.fullName ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                required
                autoComplete="name"
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder={t("pages.onboardingFunnel.namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600">{t("pages.onboardingFunnel.workEmail")}</label>
              <input
                name="email"
                type="email"
                value={profile.email ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder="you@brokerage.com"
              />
            </div>
            <button
              type="submit"
              className="onboarding-pulse-cta mt-2 w-full rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-[#005ca8]"
            >
              {t("pages.onboardingFunnel.continue")}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-500">
            {t("pages.onboardingFunnel.alreadyHaveAccount")}{" "}
            <Link href="/login?redirect=/dashboard" className="font-semibold text-sky-400 hover:underline">{t("pages.onboardingFunnel.logIn")}</Link>
          </p>
        </div>
      </Shell>
    );
  }

  /* ——— Step 2: Quick setup ——— */
  if (step === 2) {
    return (
      <Shell step={2}>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl backdrop-blur-md sm:p-8">
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.quickSetup")}</h1>
          <p className="mt-2 text-sm text-gray-600">{t("pages.onboardingFunnel.tuneDemo")}</p>
          <form
            className="mt-8 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const city = String(fd.get("city") ?? "").trim();
              const focus = fd.get("focus") as LeadFocus;
              const priceRangeId = fd.get("priceRangeId") as PriceRangeId;
              if (!city) return;
              setProfile((p) => ({ ...p, city, focus, priceRangeId }));
              go(3, "setup_complete");
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-gray-600">{t("pages.onboardingFunnel.primaryCity")}</label>
              <input
                name="city"
                defaultValue={profile.city ?? ""}
                required
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder={t("pages.onboardingFunnel.cityPlaceholder")}
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-600">{t("pages.onboardingFunnel.pipelineFocus")}</span>
              <div className="mt-2 grid gap-2">
                {FOCUS_OPTIONS.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 has-[:checked]:border-sky-500/60 has-[:checked]:bg-sky-500/10"
                  >
                    <input
                      type="radio"
                      name="focus"
                      value={o.id}
                      defaultChecked={(profile.focus ?? "both") === o.id}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{o.label}</span>
                      <span className="text-xs text-gray-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-600">{t("pages.onboardingFunnel.dealSize")}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRICE_OPTIONS.map((o) => (
                  <label key={o.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="priceRangeId"
                      value={o.id}
                      defaultChecked={(profile.priceRangeId ?? "750-1500") === o.id}
                      className="peer sr-only"
                    />
                    <span className="inline-flex rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold peer-checked:border-sky-500 peer-checked:bg-sky-500/20 peer-checked:text-gray-900">
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => go(1, "back")}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >{t("pages.onboardingFunnel.back")}</button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg hover:bg-[#005ca8]"
              >
                {t("pages.onboardingFunnel.activatePipeline")}
              </button>
            </div>
          </form>
        </div>
      </Shell>
    );
  }

  /* ——— Step 3: Activation ——— */
  if (step === 3) {
    return (
      <Shell step={3}>
        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/80 p-6 font-mono text-sm shadow-xl backdrop-blur-md sm:p-8">
          <div className="mb-4 flex items-center gap-2 text-emerald-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wide">{t("pages.onboardingFunnel.simulation")}</span>
          </div>
          <h1 className="font-heading text-xl font-bold text-white sm:text-2xl">
            {t("pages.onboardingFunnel.turningOn")}
          </h1>
          <ul className="mt-6 min-h-[180px] space-y-2 text-xs text-slate-300 sm:text-sm">
            {activationLog.map((line, idx) => (
              <li key={`${idx}-${line}`} className="onboarding-fade-up border-l-2 border-sky-500/40 pl-3">
                {line}
              </li>
            ))}
          </ul>
          {activationDone ? (
            <button
              type="button"
              onClick={() => {
                setSelectedLeadId(null);
                go(4, "activation_done");
              }}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-500"
            >
              {t("pages.onboardingFunnel.openInbox")}
            </button>
          ) : (
            <p className="mt-6 text-xs text-slate-500">{t("pages.onboardingFunnel.handshake")}</p>
          )}
        </div>
      </Shell>
    );
  }

  /* ——— Step 4: Demo leads inbox ——— */
  if (step === 4) {
    return (
      <Shell step={4}>
        <div className="relative">
          <div className="pointer-events-none fixed right-3 top-20 z-[80] flex max-w-[min(100%,320px)] flex-col gap-2 sm:right-6">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="onboarding-toast-in pointer-events-auto rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur-md"
              >
                <span className="text-amber-400">{t("pages.onboardingFunnel.incoming")} </span>
                {toast.text}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-heading text-xl font-bold sm:text-2xl">{t("pages.onboardingFunnel.newLeads")}</h1>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                {t("pages.onboardingFunnel.waitingCount", { count: demoLeads.length })}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t("pages.onboardingFunnel.tapToRespond")}</p>
            <ul className="mt-6 space-y-3">
              {demoLeads.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      setEngagementPoints((n) => n + 1);
                      go(5, "lead_open");
                    }}
                    className="flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-sky-500/40 hover:bg-sky-500/5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-[#0072ce] text-sm font-bold text-white">
                      {lead.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{lead.name}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                          {lead.intent}
                        </span>
                        <span className="text-[10px] text-gray-500">{lead.channel}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{lead.snippet}</p>
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        {t("pages.onboardingFunnel.firstResponseWins", { minutes: lead.waitingSinceMin })}
                      </p>
                    </div>
                    <span className="text-sky-400">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Shell>
    );
  }

  /* ——— Step 5: Interaction ——— */
  if (step === 5 && selectedLead) {
    const lead = selectedLead;
    return (
      <Shell step={5}>
        <div className="relative">
          <div className="pointer-events-none fixed right-3 top-20 z-[80] flex max-w-[min(100%,320px)] flex-col gap-2 sm:right-6">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="onboarding-toast-in pointer-events-auto rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg"
              >
                <span className="text-amber-400">{t("pages.onboardingFunnel.incoming")} </span>
                {toast.text}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-xl backdrop-blur-md">
            <div className="border-b border-gray-200 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => go(4, "back_inbox")}
                className="text-xs font-semibold text-sky-400 hover:underline"
              >
                ← Inbox
              </button>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-[#0072ce] text-base font-bold">
                  {lead.initials}
                </span>
                <div>
                  <h1 className="font-heading text-lg font-bold">{lead.name}</h1>
                  <p className="text-xs text-gray-500">
                    {lead.intent} · {lead.budget} · {lead.area}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  {t("pages.onboardingFunnel.scoreN", { score: lead.score })}
                </span>
              </div>
            </div>
            <div className="max-h-[min(52vh,420px)] space-y-3 overflow-y-auto p-4 sm:p-5">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"} onboarding-fade-up`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.from === "agent"
                        ? "bg-[#0072ce] text-white"
                        : "border border-gray-200 bg-white text-gray-900"
                    }`}
                  >
                    {m.text}
                    <div className="mt-1 text-[10px] opacity-70">{m.at}</div>
                  </div>
                </div>
              ))}
            </div>
            <form
              className="border-t border-gray-200 p-4 sm:p-5"
              onSubmit={(e) => {
                e.preventDefault();
                const text = replyDraft.trim();
                if (!text) return;
                setThread((prev) => [
                  ...prev,
                  {
                    id: `a-${Date.now()}`,
                    from: "agent",
                    text,
                    at: "Sent",
                  },
                ]);
                setReplyDraft("");
                setHasReplied(true);
                setEngagementPoints((n) => n + 2);
                setTimeout(() => {
                  setPaywallSeen(true);
                  go(6, "paywall_trigger");
                }, 650);
              }}
            >
              <label className="sr-only">{t("pages.oneWord.reply")}</label>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={2}
                placeholder={t("pages.onboardingFunnel.writeFastReply")}
                className="w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-[#0072ce] py-3 text-sm font-bold text-white hover:bg-[#005ca8]"
              >
                {t("pages.onboardingFunnel.sendReply")}
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-500">{t("pages.onboardingFunnel.draftOnPro")}</p>
            </form>
          </div>
        </div>
      </Shell>
    );
  }

  /* ——— Step 6: Paywall trigger ——— */
  if (step === 6) {
    return (
      <Shell step={6}>
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-950/80 to-slate-950/90 p-6 shadow-2xl sm:p-8">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-rose-300">{t("pages.onboardingFunnel.leadsWaiting")}</p>
          <h1 className="mt-3 text-center font-heading text-2xl font-bold leading-tight sm:text-3xl">
            {t("pages.onboardingFunnel.moreQueued")}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-sm text-rose-100/90">{t("pages.onboardingFunnel.provedSpeed")}</p>
          <div className="mx-auto mt-8 max-w-sm rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
            <p className="font-semibold text-white">{t("pages.onboardingFunnel.unlocked")}</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <BrandCheck tone="primary" />
                <span>{t("pages.onboardingFunnel.profilesMatched", { city: fullProfile.city })}</span>
              </li>
              <li className="flex items-start gap-2">
                <BrandCheck tone="success" />
                <span>{t("pages.onboardingFunnel.inboxPreview")}</span>
              </li>
              <li className="flex items-start gap-2">
                <BrandCheck tone="accent" />
                <span>{t("pages.onboardingFunnel.simulatedLeadStream")}</span>
              </li>
            </ul>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => go(7, "to_pricing_embed")}
              className="onboarding-pulse-cta rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-rose-950 shadow-lg hover:bg-rose-50"
            >
              {t("pages.onboardingFunnel.comparePlans")}
            </button>
            <Link
              href={`/plans?from=onboarding&email=${encodeURIComponent(fullProfile.email)}`}
              className="rounded-xl border border-white/25 px-6 py-3.5 text-center text-sm font-semibold text-white hover:bg-white/5"
            >{t("pages.onboardingFunnel.openPricing")}</Link>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            {t("pages.onboardingFunnel.noCardCancel")}
          </p>
        </div>
      </Shell>
    );
  }

  /* ——— Step 7: Pricing (embedded summary) ——— */
  if (step === 7) {
    type CardCadence = "monthly" | "annual";
    const cadence: CardCadence = onboardingCadence;
    /*
     * Two decimals always. Rounding alone renders 1590/12 as "$132.5", which
     * next to "$65.83" and "$249.17" reads as a glitch rather than a price.
     */
    const annualMo = (annual: number) => (annual / 12).toFixed(2);
    const formatHeadline = (m: number, a: number) =>
      cadence === "annual" ? `$${annualMo(a)}` : `$${m}`;
    const formatSubtext = (a: number, m: number) =>
      cadence === "annual" ? `$${a} billed yearly · save $${m * 2}` : "Billed monthly";

    /** Look a tier up in the billing catalogue; the funnel shows a subset. */
    type PaidTier = "solo" | "pro" | "premium" | "signature";
    const tierOf = (id: PaidTier) => CREDIT_TIERS.find((t) => t.id === id);
    const tierName = (id: PaidTier) => tierOf(id)?.name ?? "";
    const tierMonthly = (id: PaidTier) => tierOf(id)?.priceUsd ?? 0;
    const tierAnnual = (id: PaidTier) => annualUsd(id);
    /**
     * What a tier's credits actually buy, in the catalogue's own terms.
     *
     * Written from CREDIT_COSTS rather than by hand because the blurbs drifted
     * twice before — they were still quoting minute counts from an older
     * per-minute rate long after it changed.
     */
    const tierCredits = (id: PaidTier) => {
      const t = tierOf(id);
      if (!t) return [] as string[];
      return [
        `${t.monthlyCredits.toLocaleString()} credits/mo`,
        `≈ ${approxCallMinutes(t.monthlyCredits).toLocaleString()} AI call minutes`,
        `≈ ${approxVideos(t.monthlyCredits, "twinAvatar").toLocaleString()} AI videos`,
      ];
    };

    /*
     * Prices are READ FROM THE BILLING CATALOGUE, never written here.
     *
     * This block used to carry its own numbers — Pro $49, Premium $99,
     * Signature $249 — from two repricings ago. Stripe charges $159, $299 and
     * $399. A brokerage manager was quoted $49 on this exact screen. Four
     * separate surfaces each had their own copy of the price list and no two
     * agreed; the only cure is to have none of them own it.
     */
    type SoloPlan = {
      slug: "starter" | "solo" | "pro" | "premium" | "signature";
      name: string;
      monthly: number;
      annual: number | null;
      cta: string;
      tagline: string;
      features: string[];
      limits?: string[];
      primary?: boolean;
      badge?: string;
      signatureLook?: boolean;
      trialNote?: string;
    };

    const soloPlans: SoloPlan[] = [
      {
        slug: "starter",
        name: "Starter",
        monthly: 0,
        annual: null,
        cta: "Get started",
        tagline: "For new agents testing the platform.",
        features: ["5 leads · 50 contacts", "2 CMA reports/day", "AI SMS + email (basic)", "100 AI actions/mo"],
        limits: ["No SMS automation", "Limited AI"],
      },
      {
        /*
         * Solo was missing entirely. The funnel listed four plans against a
         * five-tier catalogue, so the cheapest paid plan did not exist in the
         * signup flow and a prospect went straight from $0 to $159 — the
         * $79 step was only ever visible on /plans.
         *
         * Its copy is the catalogue's own blurb and credit maths, not invented
         * feature bullets: under this pricing model every plan includes every
         * feature and the tiers differ only by credit volume, so a
         * feature-gated card for Solo would be describing a product we do not
         * sell.
         */
        slug: "solo",
        name: tierName("solo"),
        monthly: tierMonthly("solo"),
        annual: tierAnnual("solo"),
        cta: "Start 14-day trial",
        tagline: tierOf("solo")?.blurb ?? "",
        features: tierCredits("solo"),
        trialNote: "14-day free trial",
      },
      {
        slug: "pro",
        name: tierName("pro"),
        monthly: tierMonthly("pro"),
        annual: tierAnnual("pro"),
        cta: "Start 14-day trial",
        tagline: "For active agents closing deals consistently.",
        features: [
          "500 leads · 500 contacts",
          "Bilingual English / 中文 AI",
          "Producer Track coaching",
          "5 CMA reports/day",
          "SMS + email AI (< 60s)",
          "Bookkeeping — invoices & expenses",
          "5,000 AI actions/mo",
        ],
        primary: true,
        badge: "Most Popular",
        trialNote: "14-day free trial",
      },
      {
        slug: "premium",
        name: tierName("premium"),
        monthly: tierMonthly("premium"),
        annual: tierAnnual("premium"),
        cta: "Start 14-day trial",
        tagline: "For top producers running solo.",
        features: [
          "Unlimited leads & contacts",
          "AI Receptionist + AI Concierge",
          "Top Producer Track coaching",
          "ISA workflow",
          "E-signature (Dotloop / DocuSign)",
          "Unlimited AI actions",
        ],
        trialNote: "14-day free trial",
      },
      {
        slug: "signature",
        name: tierName("signature"),
        monthly: tierMonthly("signature"),
        annual: tierAnnual("signature"),
        cta: "Start 14-day trial",
        tagline: "For relationship-driven agents serving high-value clients.",
        features: [
          "Everything in Premium, plus:",
          "Sphere Intelligence Pro",
          "White-glove onboarding",
          "Concierge support",
          "Cultural calendar automations",
          "Custom voice tuning",
        ],
        signatureLook: true,
        badge: "Bilingual & Luxury",
        trialNote: "14-day free trial",
      },
    ];

    /*
     * Where a chosen plan sends someone.
     *
     * This used to deep-link into /agent/pricing with `checkout_plan` so that
     * storefront could open a checkout straight away. That storefront sold the
     * retired feature-tier ladder and now redirects, which would drop these
     * params anyway. More to the point, the credit ladder cannot be bought
     * without an account — buying lives on the Credits page — so "pick a plan,
     * pay now" is no longer a flow that exists.
     *
     * `plan` is kept so the destination can highlight the card they picked;
     * nothing depends on it, and it costs nothing if unread.
     */
    function deepLinkFor(slug: SoloPlan["slug"]): string {
      const params = new URLSearchParams({ from: "onboarding", plan: slug });
      if (profile.email) params.set("email", profile.email.trim());
      /*
       * The cadence has to travel. Without it, choosing Annual here — "$3,990
       * billed yearly, save $798" — landed on a page headed "Monthly plans"
       * quoting $399/mo, and the only signal of what the visitor actually
       * asked for was gone.
       */
      params.set("cadence", cadence);
      return `/plans?${params.toString()}`;
    }

    return (
      <Shell step={7} wide>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.chooseScale")}</h1>
            <p className="mt-2 text-sm text-gray-500">{t("pages.onboardingFunnel.trialNote")}<br />
              Available in English and 中文.
            </p>
          </div>

          {/* Cadence toggle */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-gray-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setOnboardingCadence("monthly")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  cadence === "monthly" ? "bg-[#0072ce] text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >{t("pages.onboardingFunnel.monthly")}</button>
              <button
                type="button"
                onClick={() => setOnboardingCadence("annual")}
                className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  cadence === "annual" ? "bg-[#0072ce] text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >{t("pages.onboardingFunnel.annual")}<span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    cadence === "annual" ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700"
                  }`}
                >{t("pages.onboardingFunnel.save17")}</span>
              </button>
            </div>
          </div>

          {/* Five tiers, one row from lg up. At the funnel's default max-w-xl
              a 5-up grid gives each card ~100px and every feature wraps to one
              word per line, so step 7 widens the shell (see `wide` above). */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {soloPlans.map((p) => {
              const isSignature = !!p.signatureLook;
              const wrapClass = isSignature
                ? "relative flex flex-col rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-5 shadow-xl shadow-amber-300/20"
                : p.primary
                  ? "relative flex flex-col rounded-2xl border-2 border-sky-500 bg-sky-50 p-5 shadow-lg shadow-sky-900/10"
                  : "relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5";
              const ctaClass = isSignature
                ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                : p.primary
                  ? "bg-[#0072ce] text-white hover:bg-[#005ca8]"
                  : "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50";
              const badgeClass = isSignature
                ? "absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-3 py-0.5 text-[10px] font-bold text-amber-950 whitespace-nowrap"
                : "absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#0072ce] px-3 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap";

              return (
                <div key={p.slug} className={wrapClass}>
                  {p.badge && <span className={badgeClass}>{p.badge}</span>}
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{p.name}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {p.slug === "starter" ? "$0" : formatHeadline(p.monthly, p.annual ?? p.monthly * 10)}
                    </span>
                    <span className="text-xs text-gray-500">{p.slug === "starter" ? "forever" : "/mo"}</span>
                  </div>
                  {p.slug !== "starter" && p.annual && (
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      {formatSubtext(p.annual, p.monthly)}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-gray-500">{p.tagline}</p>

                  <ul className="mt-3 flex-1 space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                        <svg className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                    {(p.limits ?? []).map((l) => (
                      <li key={l} className="flex items-start gap-1.5 text-xs text-gray-500">
                        <span className="mt-0.5 inline-block h-3 w-3 shrink-0 text-center leading-3">—</span>
                        {l}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={p.slug === "starter" ? "/signup" : deepLinkFor(p.slug)}
                    className={`mt-5 block w-full rounded-xl py-3 text-center text-sm font-bold ${ctaClass}`}
                  >
                    {p.cta}
                  </Link>
                  {p.trialNote && (
                    <p className="mt-1.5 text-center text-[10px] text-gray-500">{p.trialNote}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Team CTA — own row, brokerage positioning */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {/*
                    * No price. The Team tier is retired — not in CREDIT_TIERS, and its
                    * Stripe product was archived 2026-09-04 — yet this quoted 299 a month
                    * (249 on annual) from the old ladder. `/plans` already asks the same
                    * question with no number, which is the honest version: seats are a
                    * conversation, not a self-serve price.
                    */}
                  {t("pages.onboardingFunnel.teamHeading")}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t("pages.onboardingFunnel.teamSeats")}
                </p>
              </div>
              <Link
                href="/contact?from=onboarding&topic=team"
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
                {t("pages.onboardingFunnel.contactSales")}
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(8, "upgrade_flow")}
            className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t("pages.onboardingFunnel.readyCreateAccount")}
          </button>
        </div>
      </Shell>
    );
  }

  /* ——— Step 8: Upgrade / account ——— */
  if (step === 8) {
    return (
      <Shell step={8}>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xl backdrop-blur-md sm:p-10">
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.finishSetup")}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600">{t("pages.onboardingFunnel.createProfile")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:mx-auto sm:max-w-md">
            <Link
              href={`/agent-signup?${signupQuery}`}
              className="rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg hover:bg-[#005ca8]"
            >{t("pages.onboardingFunnel.createAccount")}</Link>
            <Link
              href="/agent/pricing?from=onboarding#plans"
              className="rounded-xl border border-gray-300 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >{t("pages.onboardingFunnel.viewPlans")}</Link>
            <Link href="/login?redirect=/dashboard" className="text-sm font-semibold text-sky-400 hover:underline">{t("pages.onboardingFunnel.alreadyRegistered")}</Link>
          </div>
          <button
            type="button"
            onClick={() => {
              clearOnboarding();
              setStep(1);
              setProfile({});
              setSelectedLeadId(null);
              setHasReplied(false);
              setPaywallSeen(false);
              setEngagementPoints(0);
            }}
            className="mt-8 text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
          >{t("pages.onboardingFunnel.restart")}</button>
        </div>
      </Shell>
    );
  }

  /* Step 5 but leads not ready (e.g. refresh edge case) */
  if (step === 5 && !selectedLead) {
    return (
      <Shell step={5}>
        <p className="text-center text-gray-500">{t("pages.onboardingFunnel.loadingConversation")}</p>
      </Shell>
    );
  }

  return null;
}

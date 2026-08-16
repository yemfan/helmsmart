"use client";

import Link from "next/link";
import { BrandCheck } from "@/components/brand/BrandCheck";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildDemoLeads, randomIncomingSnippet } from "./demoLeads";
import { clearOnboarding, loadOnboarding, saveOnboarding, stepToProgress } from "./storage";
import type { DemoLead, LeadFocus, OnboardingProfile, OnboardingStep, PriceRangeId } from "./types";

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
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
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
      <p className="mt-1.5 text-[11px] text-slate-400">{t("pages.onboardingFunnel.previewBanner")}</p>
    </div>
  );
}

function Shell({
  children,
  step,
}: {
  children: React.ReactNode;
  step: OnboardingStep;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,114,206,0.25),transparent)]" />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:max-w-xl sm:px-6 sm:py-12">
        <header className="mb-6 flex items-center justify-between gap-3 onboarding-fade-up">
          <Link href="/" className="flex items-center opacity-90 transition hover:opacity-100">
            <CloseBossLogo compact tone="dark" className="max-w-[240px]" />
          </Link>
          <Link
            href="/agent/pricing"
            className="text-xs font-semibold text-sky-300/90 underline-offset-2 hover:text-white hover:underline"
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
   * only a "Loading…" stub — see TOM report MJ-003.
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  /* ——— Step 1: Signup ——— */
  if (step === 1) {
    return (
      <Shell step={1}>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300/90">CloseBoss</p>
          <h1 className="mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl">{t("pages.onboardingFunnel.heroTitle")}</h1>
          <p className="mt-3 text-sm text-slate-300">{t("pages.onboardingFunnel.heroSub")}</p>
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
              <label className="block text-xs font-semibold text-slate-300">{t("pages.onboardingFunnel.fullName")}</label>
              <input
                name="fullName"
                value={profile.fullName ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                required
                autoComplete="name"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder={t("pages.onboardingFunnel.namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300">{t("pages.onboardingFunnel.workEmail")}</label>
              <input
                name="email"
                type="email"
                value={profile.email ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder="you@brokerage.com"
              />
            </div>
            <button
              type="submit"
              className="onboarding-pulse-cta mt-2 w-full rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-[#005ca8]"
            >
              Continue →
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.quickSetup")}</h1>
          <p className="mt-2 text-sm text-slate-300">{t("pages.onboardingFunnel.tuneDemo")}</p>
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
              <label className="block text-xs font-semibold text-slate-300">{t("pages.onboardingFunnel.primaryCity")}</label>
              <input
                name="city"
                defaultValue={profile.city ?? ""}
                required
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                placeholder={t("pages.onboardingFunnel.cityPlaceholder")}
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-300">{t("pages.onboardingFunnel.pipelineFocus")}</span>
              <div className="mt-2 grid gap-2">
                {FOCUS_OPTIONS.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-3 has-[:checked]:border-sky-500/60 has-[:checked]:bg-sky-500/10"
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
                      <span className="text-xs text-slate-400">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-300">{t("pages.onboardingFunnel.dealSize")}</span>
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
                    <span className="inline-flex rounded-full border border-white/15 bg-slate-950/40 px-4 py-2 text-xs font-semibold peer-checked:border-sky-500 peer-checked:bg-sky-500/20 peer-checked:text-white">
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
                className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"
              >{t("pages.onboardingFunnel.back")}</button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg hover:bg-[#005ca8]"
              >
                Activate my pipeline →
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
            Turning on your AI lead desk…
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
              Open my inbox →
            </button>
          ) : (
            <p className="mt-6 text-xs text-slate-500">Secure handshake with CloseBoss routing…</p>
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
            {toasts.map((t) => (
              <div
                key={t.id}
                className="onboarding-toast-in pointer-events-auto rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur-md"
              >
                <span className="text-amber-400">Incoming · </span>
                {t.text}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-heading text-xl font-bold sm:text-2xl">{t("pages.onboardingFunnel.newLeads")}</h1>
              <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-200">
                {demoLeads.length} waiting
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{t("pages.onboardingFunnel.tapToRespond")}</p>
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
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-4 text-left transition hover:border-sky-500/40 hover:bg-sky-500/5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-[#0072ce] text-sm font-bold text-white">
                      {lead.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{lead.name}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
                          {lead.intent}
                        </span>
                        <span className="text-[10px] text-slate-500">{lead.channel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{lead.snippet}</p>
                      <p className="mt-1 text-[11px] font-medium text-amber-200/90">
                        ⏱ First response wins · waiting {lead.waitingSinceMin}m
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
            {toasts.map((t) => (
              <div
                key={t.id}
                className="onboarding-toast-in pointer-events-auto rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg"
              >
                <span className="text-amber-400">Incoming · </span>
                {t.text}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-md">
            <div className="border-b border-white/10 p-4 sm:p-5">
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
                  <p className="text-xs text-slate-400">
                    {lead.intent} · {lead.budget} · {lead.area}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200">
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
                        : "border border-white/10 bg-slate-900/80 text-slate-100"
                    }`}
                  >
                    {m.text}
                    <div className="mt-1 text-[10px] opacity-70">{m.at}</div>
                  </div>
                </div>
              ))}
            </div>
            <form
              className="border-t border-white/10 p-4 sm:p-5"
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
                placeholder="Write a fast reply… (demo)"
                className="w-full resize-none rounded-xl border border-white/15 bg-slate-950/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-[#0072ce] py-3 text-sm font-bold text-white hover:bg-[#005ca8]"
              >
                Send reply →
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-500">{t("pages.onboardingFunnel.draftOnPro")}</p>
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
            2 more conversations are queued in your territory
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
                <span>Simulated live “incoming lead” stream</span>
              </li>
            </ul>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => go(7, "to_pricing_embed")}
              className="onboarding-pulse-cta rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-rose-950 shadow-lg hover:bg-rose-50"
            >
              Compare plans & unlock →
            </button>
            <Link
              href={`/agent/pricing?from=onboarding&email=${encodeURIComponent(fullProfile.email)}`}
              className="rounded-xl border border-white/25 px-6 py-3.5 text-center text-sm font-semibold text-white hover:bg-white/5"
            >{t("pages.onboardingFunnel.openPricing")}</Link>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            No credit card required · Cancel anytime
          </p>
        </div>
      </Shell>
    );
  }

  /* ——— Step 7: Pricing (embedded summary) ——— */
  if (step === 7) {
    type CardCadence = "monthly" | "annual";
    const cadence: CardCadence = onboardingCadence;
    const annualMo = (annual: number) => Math.round((annual / 12) * 100) / 100;
    const formatHeadline = (m: number, a: number) =>
      cadence === "annual" ? `$${annualMo(a)}` : `$${m}`;
    const formatSubtext = (a: number, m: number) =>
      cadence === "annual" ? `$${a} billed yearly · save $${m * 2}` : "Billed monthly";

    type SoloPlan = {
      slug: "starter" | "pro" | "premium" | "signature";
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
        slug: "pro",
        name: "Pro",
        monthly: 49,
        annual: 490,
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
        name: "Premium",
        monthly: 99,
        annual: 990,
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
        name: "Signature",
        monthly: 249,
        annual: 2490,
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

    function deepLinkFor(slug: SoloPlan["slug"]): string {
      const params = new URLSearchParams({
        from: "onboarding",
        checkout_plan: slug,
        cadence,
      });
      if (profile.email) params.set("email", profile.email.trim());
      return `/agent/pricing?${params.toString()}`;
    }

    return (
      <Shell step={7}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.chooseScale")}</h1>
            <p className="mt-2 text-sm text-slate-400">{t("pages.onboardingFunnel.trialNote")}<br />
              Available in English and 中文.
            </p>
          </div>

          {/* Cadence toggle */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setOnboardingCadence("monthly")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  cadence === "monthly" ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"
                }`}
              >{t("pages.onboardingFunnel.monthly")}</button>
              <button
                type="button"
                onClick={() => setOnboardingCadence("annual")}
                className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  cadence === "annual" ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"
                }`}
              >{t("pages.onboardingFunnel.annual")}<span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    cadence === "annual" ? "bg-emerald-500 text-white" : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >{t("pages.onboardingFunnel.save17")}</span>
              </button>
            </div>
          </div>

          {/* Solo plans — 4-up at lg, 2-up at sm */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {soloPlans.map((p) => {
              const isSignature = !!p.signatureLook;
              const wrapClass = isSignature
                ? "relative flex flex-col rounded-2xl border border-amber-300/50 bg-[#0b1e3f] p-5 shadow-xl shadow-amber-300/10"
                : p.primary
                  ? "relative flex flex-col rounded-2xl border border-sky-500/50 bg-sky-500/10 p-5 shadow-lg shadow-sky-900/20"
                  : "relative flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5";
              const ctaClass = isSignature
                ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                : p.primary
                  ? "bg-[#0072ce] text-white hover:bg-[#005ca8]"
                  : "border border-white/20 text-white hover:bg-white/5";
              const badgeClass = isSignature
                ? "absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-3 py-0.5 text-[10px] font-bold text-amber-950 whitespace-nowrap"
                : "absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#0072ce] px-3 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap";

              return (
                <div key={p.slug} className={wrapClass}>
                  {p.badge && <span className={badgeClass}>{p.badge}</span>}
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{p.name}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">
                      {p.slug === "starter" ? "$0" : formatHeadline(p.monthly, p.annual ?? p.monthly * 10)}
                    </span>
                    <span className="text-xs text-slate-400">{p.slug === "starter" ? "forever" : "/mo"}</span>
                  </div>
                  {p.slug !== "starter" && p.annual && (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {formatSubtext(p.annual, p.monthly)}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-400">{p.tagline}</p>

                  <ul className="mt-3 flex-1 space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-slate-300">
                        <svg className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                    {(p.limits ?? []).map((l) => (
                      <li key={l} className="flex items-start gap-1.5 text-xs text-slate-500">
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
                    <p className="mt-1.5 text-center text-[10px] text-slate-500">{p.trialNote}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Team CTA — own row, brokerage positioning */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {t("pages.onboardingFunnel.teamPrice", { price: cadence === "annual" ? "$249/mo" : "$299/mo" })}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Up to 5 seats · round-robin routing · Top Producer Track for every member.
                </p>
              </div>
              <Link
                href="/contact?from=onboarding&topic=team"
                className="rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
              >
                Contact sales →
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(8, "upgrade_flow")}
            className="w-full rounded-xl border border-dashed border-white/20 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5"
          >
            I&apos;m ready — create my agent account →
          </button>
        </div>
      </Shell>
    );
  }

  /* ——— Step 8: Upgrade / account ——— */
  if (step === 8) {
    return (
      <Shell step={8}>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-xl backdrop-blur-md sm:p-10">
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">{t("pages.onboardingFunnel.finishSetup")}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-300">{t("pages.onboardingFunnel.createProfile")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:mx-auto sm:max-w-md">
            <Link
              href={`/agent-signup?${signupQuery}`}
              className="rounded-xl bg-[#0072ce] py-3.5 text-sm font-bold text-white shadow-lg hover:bg-[#005ca8]"
            >{t("pages.onboardingFunnel.createAccount")}</Link>
            <Link
              href="/agent/pricing?from=onboarding#plans"
              className="rounded-xl border border-white/20 py-3.5 text-sm font-semibold text-white hover:bg-white/5"
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
            className="mt-8 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >{t("pages.onboardingFunnel.restart")}</button>
        </div>
      </Shell>
    );
  }

  /* Step 5 but leads not ready (e.g. refresh edge case) */
  if (step === 5 && !selectedLead) {
    return (
      <Shell step={5}>
        <p className="text-center text-slate-400">Loading conversation…</p>
      </Shell>
    );
  }

  return null;
}

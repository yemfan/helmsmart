"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAccess } from "@/components/AccessProvider";
import { useAuth } from "@/components/AuthProvider";
import AccountMenu from "@/components/layout/AccountMenu";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import PropertyToolsLogo from "@/components/brand/PropertyToolsLogo";
import { BrandCheck } from "@/components/brand/BrandCheck";
import { FeatureHighlightCard } from "@/components/ui/FeatureHighlightCard";
import { trackEvent } from "@/lib/marketing/trackEvent";
import { mergeAuthHeaders } from "@/lib/mergeAuthHeaders";
import { scrollToSection } from "@/lib/scrollToSection";

// LeadSmart AI was renamed to CloseBoss (leadsmart-ai.com is retired / 404).
// Dedicated env var so a stale NEXT_PUBLIC_LEADSMART_URL cannot repoint us
// back at the dead domain; default to the live CloseBoss host.
const CLOSEBOSS_URL = process.env.NEXT_PUBLIC_CLOSEBOSS_URL?.trim() || "https://www.closebossai.com";

const tools = [
  {
    title: "Home Value Estimator",
    desc: "Find out what your home is worth instantly",
    href: "/home-value",
    id: "home_value",
  },
  {
    title: "Mortgage Calculator",
    desc: "Estimate your monthly payment in seconds",
    href: "/mortgage-calculator",
    id: "mortgage",
  },
  {
    title: "AI Property Comparison",
    desc: "Compare properties and find the best deal",
    href: "/ai-property-comparison",
    id: "compare",
  },
  {
    title: "Refinance Analyzer",
    desc: "See if refinancing saves you money",
    href: "/refinance-calculator",
    id: "refinance",
  },
] as const;

export default function PropertyToolsPage() {
  const { user, loading: authLoading } = useAuth();
  const { tier, openAuth, loading: accessLoading } = useAccess();
  const headerLoading = authLoading || accessLoading;
  const [email, setEmail] = useState("");
  const [leadStatus, setLeadStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [leadMessage, setLeadMessage] = useState<string | null>(null);

  const onLeadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLeadMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setLeadStatus("error");
      setLeadMessage("Please enter a valid email.");
      return;
    }

    trackEvent("lead_capture", { source: "property_tools_page" });
    setLeadStatus("loading");

    try {
      const headers = await mergeAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/leads/tool-capture", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          name: trimmed.split("@")[0] || "Subscriber",
          email: trimmed,
          source: "property_tools_page",
          tool: "detailed_insights",
          intent: "buy",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setLeadStatus("error");
        setLeadMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setLeadStatus("ok");
      setLeadMessage(null);
      setEmail("");
    } catch {
      setLeadStatus("error");
      setLeadMessage("Network error. Please try again.");
    }
  };

  return (
    <main className="bg-white text-gray-900">
      {/* Top bar — auth (homepage skips AppShell top bar) */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center">
            <PropertyToolsLogo />
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {headerLoading ? (
              <div className="flex items-center gap-2" aria-hidden>
                <div className="h-9 w-[4.5rem] animate-pulse rounded-xl bg-slate-200 sm:w-24" />
                <div className="h-9 w-20 animate-pulse rounded-xl bg-slate-200 sm:w-24" />
              </div>
            ) : !user ? (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:text-sm"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="rounded-xl bg-[#0072ce] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#005ca8] sm:px-4 sm:text-sm"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                {tier === "premium" ? (
                  <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 sm:inline">
                    Premium
                  </span>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 sm:px-4 sm:text-sm"
                  >
                    Upgrade
                  </Link>
                )}
                <AccountMenu />
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO — brand radial glow + motion (leadsmartai style) */}
      <section
        id="hero"
        className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-white"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(ellipse 90% 60% at 50% -30%, rgba(0,114,206,0.18), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 sm:py-14 md:py-16">
          <p className="landing-animate landing-delay-1 mb-3 inline-flex rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs font-medium text-[#005ca8] shadow-sm backdrop-blur-sm">
            Free AI tools for buyers & sellers
          </p>
          <h1 className="font-heading landing-animate landing-delay-2 text-3xl font-bold leading-tight tracking-tight text-gray-950 md:text-4xl lg:text-[2.5rem]">
            Smarter Tools to Help You Buy, Sell, or Finance a Home
          </h1>
          <p className="landing-animate landing-delay-3 mt-3 text-base text-gray-600 md:text-lg">
            Instantly check your home value, compare properties, and estimate your mortgage —{" "}
            <span className="font-semibold text-[#0072ce]">all powered by AI.</span>
          </p>
          <div className="landing-animate landing-delay-4 mt-6 flex flex-wrap justify-center gap-2.5 sm:gap-3">
            <Button
              href="/home-value"
              size="sm"
              className="text-sm"
              onClick={() => trackEvent("tool_click", { tool: "home_value", href: "/home-value" })}
            >
              Check Your Home Value
            </Button>
            <Button
              href="/mortgage-calculator"
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => trackEvent("tool_click", { tool: "mortgage", href: "/mortgage-calculator" })}
            >
              Calculate Mortgage
            </Button>
            <Button
              href="/ai-property-comparison"
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => trackEvent("tool_click", { tool: "compare", href: "/ai-property-comparison" })}
            >
              Compare Properties
            </Button>
          </div>
          <p className="landing-animate landing-delay-4 mt-3 text-sm text-slate-500">
            Trusted by home buyers, sellers, and investors
          </p>
          <div className="landing-animate landing-delay-5 mx-auto mt-8 max-w-lg rounded-xl border border-slate-200/80 bg-gradient-to-r from-[#0072ce]/[0.06] via-white to-[#ff8c42]/[0.07] px-4 py-3 shadow-sm shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.04]">
            <div className="flex items-center gap-2 border-l-4 border-[#0072ce] pl-3 text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#005ca8]">Why PropertyTools AI</p>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5 text-left text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:gap-x-5">
              <li className="flex items-center gap-2">
                <BrandCheck tone="primary" />
                <span>Real-time data &amp; clear numbers</span>
              </li>
              <li className="flex items-center gap-2">
                <BrandCheck tone="success" />
                <span>Compare options side by side</span>
              </li>
              <li className="flex items-center gap-2">
                <BrandCheck tone="accent" />
                <span>No agent required to get started</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* TOOL GRID */}
      <section
        id="tools"
        className="mx-auto grid max-w-7xl grid-cols-1 gap-4 bg-gradient-to-b from-white to-slate-50/50 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4"
      >
        {tools.map((tool) => (
          <Card key={tool.id} variant="interactive" className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
              <h3 className="font-heading text-lg font-semibold leading-snug text-slate-900">{tool.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-gray-600">{tool.desc}</p>
              <Button
                href={tool.href}
                size="sm"
                className="mt-4 w-full shrink-0 text-sm"
                onClick={() => trackEvent("tool_click", { tool: tool.id, href: tool.href })}
              >
                Try Now
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* PAIN */}
      <section
        id="pain"
        className="border-y border-amber-100 bg-gradient-to-b from-amber-50/50 via-white to-slate-50/80 px-4 py-12 text-center sm:px-6 md:py-14"
      >
        <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-[1.65rem]">
          Avoid Costly Real Estate Mistakes
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
          Most people rely on outdated estimates, guesswork, and incomplete data. That leads to bad decisions — and lost
          money.
        </p>
      </section>

      {/* AI VALUE — same top-accent card style as LeadSmart AI “Close More Deals with Less Work” */}
      <section id="ai-value" className="px-4 py-12 text-center sm:px-6 md:py-16">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          Make Smarter Decisions with AI
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
          Free tools that turn scattered listing data into clear next steps — whether you&apos;re buying, selling, or
          refinancing.
        </p>
        <div className="mx-auto mt-10 grid max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <FeatureHighlightCard
            accent="primary"
            title="🏠 Instant home value"
            description="Estimate range and context from your address and basics — no signup for core use."
          />
          <FeatureHighlightCard
            accent="primaryDark"
            title="📊 Side-by-side compare"
            description="Stack properties on price, payment, and tradeoffs with AI-guided summaries."
          />
          <FeatureHighlightCard
            accent="success"
            title="💰 Mortgage clarity"
            description="Payments, refinance scenarios, and affordability — in plain numbers."
          />
          <FeatureHighlightCard
            accent="accent"
            title="🤖 AI that explains"
            description="Recommendations you can understand fast — without drowning in jargon."
          />
        </div>
      </section>

      {/* FEATURED TOOL */}
      <section
        id="featured"
        className="border-y border-slate-200/80 bg-gradient-to-b from-slate-50/90 via-white to-sky-50/30 px-4 py-12 text-center sm:px-6 md:py-14"
      >
        <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-[1.65rem]">
          AI Property Comparison
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
          Let AI analyze price, location, investment potential, and monthly cost to find the best property.
        </p>
        <Button
          href="/ai-property-comparison"
          size="sm"
          className="mt-5 text-sm"
          onClick={() => trackEvent("tool_click", { tool: "compare_feature", href: "/ai-property-comparison" })}
        >
          Try AI Property Comparison
        </Button>
      </section>

      {/* LEAD CAPTURE */}
      <section id="lead" className="px-4 py-12 text-center sm:px-6 md:py-14">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/80 via-white to-[#0072ce]/[0.05] p-6 shadow-sm shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.04] sm:p-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-[1.65rem]">
            Stay in the loop
          </h2>
          <p className="mt-2 text-sm text-gray-600 md:text-base">
            Get tips and product updates by email. For a <span className="font-semibold text-slate-800">full home value breakdown</span>{" "}
            (range + confidence), use the{" "}
            <Link href="/home-value" className="font-semibold text-[#0072ce] underline-offset-2 hover:underline">
              Home Value Estimator
            </Link>{" "}
            — after you run it, you can unlock the full report on that page.
          </p>
          <form
            onSubmit={onLeadSubmit}
            className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-center sm:gap-2"
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 flex-1 text-sm md:h-10"
            />
            <Button
              type="submit"
              size="sm"
              disabled={leadStatus === "loading"}
              className="shrink-0 text-sm sm:w-auto"
            >
              {leadStatus === "loading" ? "Sending…" : "Subscribe"}
            </Button>
          </form>
          <div role="status" aria-live="polite" className="min-h-[1.25rem]">
            {leadStatus === "ok" ? (
              <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-left text-sm text-emerald-900">
                <p className="font-medium">You&apos;re subscribed — check your inbox.</p>
                <p className="text-emerald-800/90">
                  To see a <strong>full report</strong> (value range + confidence) for a property, open the{" "}
                  <Link href="/home-value" className="font-semibold text-[#0072ce] underline-offset-2 hover:underline">
                    Home Value Estimator
                  </Link>
                  , run an estimate, then use <strong>Unlock Full Report</strong> there.
                </p>
              </div>
            ) : leadMessage ? (
              <p className={`mt-2 text-xs md:text-sm ${leadStatus === "error" ? "text-red-600" : "text-slate-600"}`}>
                {leadMessage}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section
        id="proof"
        className="border-t border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 px-4 py-12 text-center sm:px-6 md:py-14"
      >
        <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-[1.65rem]">
          What Users Say
        </h2>
        <div className="mx-auto mt-6 max-w-xl space-y-4 text-sm text-gray-600 md:space-y-5 md:text-base">
          <p className="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm">
            &ldquo;Super helpful before buying my first home&rdquo;
            <span className="mt-1 block text-xs font-semibold text-[#0072ce] md:text-sm">— Buyer</span>
          </p>
          <p className="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm">
            &ldquo;Helped me compare properties easily&rdquo;
            <span className="mt-1 block text-xs font-semibold text-[#0072ce] md:text-sm">— Investor</span>
          </p>
          <p className="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm">
            &ldquo;Way better than guessing online&rdquo;
            <span className="mt-1 block text-xs font-semibold text-[#0072ce] md:text-sm">— Homeowner</span>
          </p>
        </div>
      </section>

      {/* CROSS SELL */}
      <section
        id="cross-sell"
        className="border-y border-slate-200/80 bg-gradient-to-r from-[#0072ce]/[0.06] via-white to-[#ff8c42]/[0.08] px-4 py-12 text-center sm:px-6 md:py-14"
      >
        <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 md:text-[1.65rem]">
          Are You an Agent?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600 md:text-base">
          Use CloseBoss to turn traffic like this into real deals.
        </p>
        <a
          href={CLOSEBOSS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("default", "sm", "mt-4 text-sm")}
          onClick={() => trackEvent("tool_click", { tool: "closeboss_cross_sell", href: CLOSEBOSS_URL })}
        >
          Learn More
        </a>
      </section>

      {/* FINAL CTA */}
      <section
        id="cta"
        className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-[#0072ce]/35 px-4 py-12 text-center text-white sm:px-6 sm:py-16"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 55% at 50% 100%, rgba(0,114,206,0.5), transparent 60%)",
          }}
        />
        <div className="relative">
          <h2 className="font-heading text-2xl font-bold leading-snug text-white md:text-[1.65rem]">
            Start Making Smarter Decisions Today
          </h2>
          <p className="mt-2 text-sm text-gray-200 md:text-base">Free. Fast. AI-powered.</p>
          <a
            href="#tools"
            className={`${buttonClasses("inverse", "sm", "mt-5 text-sm")}`}
            onClick={(e) => {
              trackEvent("tool_click", { tool: "final_cta", href: "#tools" });
              if (typeof window !== "undefined" && window.location.pathname === "/") {
                e.preventDefault();
                scrollToSection("tools");
              }
            }}
          >
            Try a Tool Now
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200/80 bg-slate-50/50 px-4 py-8 text-center text-xs text-gray-500 sm:px-6 md:text-sm">
        <p>© {new Date().getFullYear()} PropertyToolsAI</p>
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs md:mt-4 md:gap-x-6 md:text-sm">
          <a
            href="#tools"
            className="font-medium text-slate-600 transition hover:text-[#0072ce]"
            onClick={(e) => {
              if (typeof window !== "undefined" && window.location.pathname === "/") {
                e.preventDefault();
                scrollToSection("tools");
              }
            }}
          >
            Tools
          </a>
          <Link href="/pricing" className="font-medium text-slate-600 transition hover:text-[#0072ce]">
            Pricing
          </Link>
          <Link href="/blog" className="font-medium text-slate-600 transition hover:text-[#0072ce]">
            Blog
          </Link>
          <Link href="/contact" className="font-medium text-slate-600 transition hover:text-[#0072ce]">
            Contact
          </Link>
          <Link href="/privacy" className="font-medium text-slate-600 transition hover:text-[#0072ce]">
            Privacy
          </Link>
          <Link href="/terms" className="font-medium text-slate-600 transition hover:text-[#0072ce]">
            Terms
          </Link>
        </nav>
      </footer>
    </main>
  );
}

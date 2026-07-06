"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  GraduationCap,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { RealtyBossLogo } from "@/components/brand/RealtyBossLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureHighlightCard } from "@/components/ui/FeatureHighlightCard";
import { BrandCheck } from "@/components/brand/BrandCheck";
import HeaderAuthActions from "@/components/HeaderAuthActions";
import VslSection from "@/components/VslSection";

const ExitIntentPopup = dynamic(
  () => import("@/components/marketing/ExitIntentPopup"),
  { ssr: false }
);

const SupportChatLauncher = dynamic(
  () => import("@/components/support/CustomerSupportChat").then(mod => ({ default: mod.SupportChatLauncher })),
  { ssr: false }
);

const primaryCtaHref = "/onboarding";
const vslAnchorHref = "#vsl";

/**
 * Section anchor links shared between the desktop nav (md+) and the
 * mobile drawer. Hash slugs are computed once here so they stay in sync
 * if section IDs ever move.
 */
/**
 * `hash` slugs starting with `#` scroll within the landing page;
 * route paths (starting with `/`) link out to dedicated pages
 * (Features → `/features`, Pricing → `/pricing`). The same shape
 * feeds desktop nav + mobile drawer so they stay in sync.
 */
const NAV_SECTIONS: { label: string; hash: string }[] = [
  { label: "Problem", hash: "#problem" },
  { label: "Solution", hash: "#solution" },
  { label: "How It Works", hash: "#how" },
  { label: "Features", hash: "/features" },
  { label: "Pricing", hash: "/pricing" },
];

/* ── Scroll-triggered fade-in ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function getVslConfig(): {
  videoType: "youtube" | "vimeo" | "html5";
  videoIdOrUrl: string;
} {
  const mp4 = process.env.NEXT_PUBLIC_VSL_MP4_URL?.trim();
  if (mp4) return { videoType: "html5", videoIdOrUrl: mp4 };
  const vimeo = process.env.NEXT_PUBLIC_VSL_VIMEO_ID?.trim();
  if (vimeo) return { videoType: "vimeo", videoIdOrUrl: vimeo };
  return {
    videoType: "youtube",
    videoIdOrUrl: process.env.NEXT_PUBLIC_VSL_YOUTUBE_ID?.trim() ?? "",
  };
}

export default function LeadSmartLanding() {
  const vslConfig = getVslConfig();
  const hasVsl = Boolean(vslConfig.videoIdOrUrl);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /**
   * Pricing billing-cycle toggle. Annual billing gives users two
   * months free (monthly * 10 = annual equivalent), which renders as
   * a ~17% savings badge above the toggle. Persisted only in local
   * component state — downstream checkout URLs accept the same plan
   * slug regardless of cycle, so no routing changes are required.
   */
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  /**
   * Body scroll lock while the mobile nav drawer is open. Uses
   * `position: fixed` (not just `overflow: hidden`) because iOS Safari
   * ignores `overflow: hidden` on <body> for touch scrolling — the
   * background page would still scroll under the open drawer otherwise.
   * We restore the previous scroll position on close so the user lands
   * back where they were.
   */
  useEffect(() => {
    if (!mobileNavOpen) return;
    const scrollY = window.scrollY;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [mobileNavOpen]);

  /**
   * Refs for focus management. When the drawer opens, focus moves
   * to the close button. When it closes, focus returns to the
   * hamburger. WCAG 2.4.3 requires modal focus to stay inside.
   */
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

  /**
   * Focus trap + Escape handler for the mobile drawer.
   *
   * When the drawer opens:
   * 1. Move focus to the close button (`drawerCloseRef`)
   * 2. Set `aria-hidden="true"` on `<main>` so screen readers
   *    can't reach the background content
   * 3. Intercept Tab/Shift+Tab and cycle focus within the drawer
   * 4. On Escape, close the drawer and return focus to the
   *    hamburger button
   */
  useEffect(() => {
    if (!mobileNavOpen) return;

    // (a) Set aria-hidden on the <main> behind the drawer
    const mainEl = document.getElementById("main-content");
    if (mainEl) mainEl.setAttribute("aria-hidden", "true");

    // (b) Focus the close button after a frame so React has
    //     finished mounting the drawer DOM.
    requestAnimationFrame(() => {
      drawerCloseRef.current?.focus();
    });

    // (c) Tab/Shift+Tab focus trap + Escape
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = drawerPanelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      if (mainEl) mainEl.removeAttribute("aria-hidden");
      // Return focus to the hamburger button on close.
      hamburgerRef.current?.focus();
    };
  }, [mobileNavOpen]);

  return (
    <>
      <main id="main-content" className="bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100">
        {/* NAV */}
        <header className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/80 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="flex min-w-0 items-center rounded-md transition hover:opacity-90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0072ce]/40"
            >
              <RealtyBossLogo compact />
            </Link>

            {/* Desktop section nav (md+) */}
            <nav
              className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm lg:gap-x-6 md:flex"
              aria-label="Page sections"
            >
              {NAV_SECTIONS.map((item) => (
                <a
                  key={item.hash}
                  href={item.hash}
                  className="font-medium !text-gray-700 transition-colors hover:!text-[#0072ce] dark:!text-slate-300 dark:hover:!text-[#4da3e8]"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Right-side action cluster */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Primary CTA — visible on sm+, hidden on the smallest viewports
                  so the hamburger has room. The drawer also exposes it. */}
              <Button
                size="sm"
                href={primaryCtaHref}
                className="hidden whitespace-nowrap sm:inline-flex"
              >
                Get My First Leads
              </Button>

              {/* Auth + support — shown md+ only, drawer shows them on mobile */}
              <div className="hidden items-center gap-2 sm:gap-3 md:flex">
                <HeaderAuthActions />
                <SupportChatLauncher buttonClassName="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-600 shadow-sm transition hover:border-[#0072ce]/40 hover:bg-gray-50 hover:text-[#0072ce] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 sm:h-10 sm:w-10 sm:rounded-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-[#4da3e8]" />
              </div>

              {/* Hamburger — visible below md only */}
              <button
                ref={hamburgerRef}
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileNavOpen}
                aria-controls="leadsmart-mobile-nav"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 active:scale-[0.97] md:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile nav drawer */}
        {mobileNavOpen ? (
          <div
            className="fixed inset-0 z-[60] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            {/* Backdrop — tap to close */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />

            {/* Panel — full height on iOS using `inset-y-0` instead of h-screen */}
            <div
              ref={drawerPanelRef}
              id="leadsmart-mobile-nav"
              className="absolute right-0 top-0 bottom-0 flex w-[86%] max-w-[340px] flex-col overflow-y-auto border-l border-slate-200/80 bg-white shadow-[-8px_0_48px_-12px_rgba(15,23,42,0.25)] dark:border-slate-800 dark:bg-slate-950"
              style={{
                // iOS Safari rounding: pad-bottom by safe-area-inset-bottom so
                // the last item isn't hidden by the home indicator, and use
                // 100dvh for the inner min-height so the address bar collapse
                // doesn't reflow the panel mid-scroll.
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
                minHeight: "100dvh",
              }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Menu</span>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Section anchor links */}
              <nav className="flex flex-col px-3 py-3" aria-label="Page sections (mobile)">
                {NAV_SECTIONS.map((item) => (
                  <a
                    key={item.hash}
                    href={item.hash}
                    onClick={() => setMobileNavOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              {/* Auth + primary CTA cluster */}
              <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <Button
                  href={primaryCtaHref}
                  size="default"
                  className="w-full justify-center"
                  onClick={() => setMobileNavOpen(false)}
                >
                  Get My First Leads
                </Button>
                <div
                  className="flex items-center justify-center gap-2"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <HeaderAuthActions />
                </div>
                <div className="flex justify-center pt-1">
                  <SupportChatLauncher buttonClassName="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-600 shadow-sm transition hover:border-[#0072ce]/40 hover:bg-gray-50 hover:text-[#0072ce] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
          {/* Animated gradient mesh */}
          <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
            <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.15] blur-[100px] dark:opacity-[0.08]" style={{ background: "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)" }} />
            <div className="absolute right-0 top-1/4 h-[300px] w-[300px] rounded-full opacity-[0.06] blur-[80px]" style={{ background: "radial-gradient(circle, #ff8c42, transparent 70%)" }} />
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:gap-12 md:py-22 lg:py-28">
            <div className="max-w-xl lg:max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0072ce]/20 bg-white/80 px-4 py-1.5 text-xs font-medium text-[#0072ce] shadow-sm backdrop-blur-sm dark:border-[#0072ce]/30 dark:bg-slate-900/80 dark:text-[#4da3e8]" style={{ animation: "fadeInUp 0.7s ease-out both" }}>
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0072ce] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#0072ce]" /></span>
                Your AI Real Estate Team — From First Call to Closing
              </div>
              <h1
                className="font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-950 md:text-5xl lg:text-[3rem] dark:text-white"
                style={{ animation: "fadeInUp 0.7s ease-out 0.06s both" }}
              >
                Hire an AI Real Estate Team.
                <br />
                <span className="bg-gradient-to-r from-[#0072ce] via-[#4F46E5] to-[#7c3aed] bg-clip-text text-transparent">Close More Deals.</span>
              </h1>
              <p
                className="mt-5 text-lg leading-relaxed text-gray-600 md:text-xl dark:text-slate-400"
                style={{ animation: "fadeInUp 0.7s ease-out 0.12s both" }}
              >
                RealtyBoss <strong className="text-gray-900 dark:text-white">answers every call, follows up with every lead, and coordinates every transaction</strong> — an AI Receptionist, Sales Assistant, and Transaction Assistant working under your direction.
              </p>
              <p
                className="mt-5 text-base leading-relaxed text-gray-600 md:text-lg dark:text-slate-400"
                style={{ animation: "fadeInUp 0.6s ease-out 0.2s both" }}
              >
                Close more deals without hiring additional staff — you manage the outcomes, your AI team does the
                chasing.
              </p>
              <div
                className="mt-8 flex flex-wrap gap-3"
                style={{ animation: "fadeInUp 0.6s ease-out 0.3s both" }}
              >
                <Button
                  href={primaryCtaHref}
                  aria-describedby="hero-trust-bar"
                  className="group relative min-h-[48px] overflow-hidden px-7 text-base shadow-lg shadow-[#0072ce]/20 hover:shadow-xl hover:shadow-[#0072ce]/30 sm:min-h-11 sm:px-6"
                >
                  {/* Subtle shimmer sweep — CSS-only. The pseudo
                    * element slides a white highlight across the
                    * button on a 3s loop, drawing the eye without
                    * being obnoxious. Pauses on hover so the
                    * interaction doesn't compete with the shimmer. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{
                      animation: "cta-shimmer 3s ease-in-out infinite",
                    }}
                  />
                  Get My First Leads
                </Button>
                {hasVsl && (
                  <Button variant="outline" href={vslAnchorHref} className="min-h-11 px-6 text-base">
                    Watch 60s Demo
                  </Button>
                )}
              </div>

              {/*
               * Trust bar — the "Micro trust" label was a working name
               * leaking into production. Removed the label entirely and
               * also removed the redundant "No setup required / Works in
               * minutes" duplicate (those say the same thing). The three
               * check items speak for themselves.
               */}
              <div
                className="mt-6 rounded-xl border border-slate-200/80 bg-gradient-to-r from-[#0072ce]/[0.06] via-white to-[#ff8c42]/[0.07] px-4 py-4 shadow-sm shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.04] dark:border-slate-700 dark:from-[#0072ce]/[0.08] dark:via-slate-900 dark:to-[#ff8c42]/[0.05] dark:ring-slate-700/40"
                style={{ animation: "fadeInUp 0.6s ease-out 0.4s both" }}
              >
                <ul id="hero-trust-bar" className="flex flex-col gap-2.5 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2 dark:text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <BrandCheck tone="primary" />
                    <span>AI follow-up in seconds — so hot leads don&apos;t go cold</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <BrandCheck tone="success" />
                    <span>Built for agents already running ads &amp; SEO</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <BrandCheck tone="accent" />
                    <span>Cancel anytime — no multi-year lock-in</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Dashboard preview — app window mockup */}
            <div
              className="rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl shadow-slate-900/[0.1] dark:border-slate-700 dark:bg-slate-800"
              style={{ animation: "fadeInUp 0.8s ease-out 0.3s both" }}
            >
              {/* Window chrome */}
              <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-red-400" /><div className="h-2.5 w-2.5 rounded-full bg-amber-400" /><div className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
                <span className="ml-2 text-[10px] font-medium text-slate-400">RealtyBoss — Dashboard</span>
                <div className="ml-auto flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">Live</span></div>
              </div>
              {/* Dashboard content */}
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { n: "12", l: "New leads", color: "text-[#0072ce]", bg: "bg-[#0072ce]/5" },
                    { n: "94%", l: "Reply rate", color: "text-emerald-600", bg: "bg-emerald-50" },
                    { n: "8", l: "Tours booked", color: "text-[#4F46E5]", bg: "bg-[#4F46E5]/5" },
                  ].map(({ n, l, color, bg }) => (
                    <div key={l} className={`rounded-xl ${bg} p-3 text-center dark:bg-slate-700/50`}>
                      <p className={`text-2xl font-extrabold ${color}`}>{n}</p>
                      <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>
                {/* Mini lead list */}
                <div className="space-y-1.5">
                  {[
                    { name: "Sarah M.", status: "Hot", emoji: "🔥", time: "2m ago" },
                    { name: "James W.", status: "Warm", emoji: "💬", time: "15m ago" },
                    { name: "Lisa K.", status: "New", emoji: "✨", time: "1h ago" },
                  ].map((lead) => (
                    <div key={lead.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-700/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{lead.emoji}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{lead.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${lead.status === "Hot" ? "bg-orange-100 text-orange-700" : lead.status === "Warm" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{lead.status}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{lead.time}</span>
                    </div>
                  ))}
                </div>
                {/* Pipeline bar */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                    <span>Pipeline health</span><span>72%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#0072ce] to-[#4F46E5]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <VslSection
          {...vslConfig}
          title="See the full system: traffic → reply → booked appointment"
          subtitle="Watch how RealtyBoss qualifies and follows up so you show up first — without living in your inbox."
          ctaText="Get My First Leads"
          ctaHref={primaryCtaHref}
          trustText="No credit card required to start · Cancel anytime"
        />

        {/* PROBLEM */}
        <section
          id="problem"
          className="border-y border-rose-100 bg-gradient-to-b from-rose-50/90 via-white to-slate-50/80 px-6 py-16 text-center md:py-20 dark:border-rose-900/30 dark:from-rose-950/20 dark:via-slate-950 dark:to-slate-900/50"
        >
          <RevealSection className="mx-auto max-w-2xl">
            <h2 className="font-heading text-2xl font-bold leading-tight text-slate-900 md:text-3xl lg:text-[2rem] dark:text-white">
              You don&apos;t have a traffic problem.
            </h2>
            <p className="mt-4 font-heading text-xl font-bold text-rose-700 md:text-2xl dark:text-rose-400">
              You have a conversion problem.
            </p>
            <ul className="mx-auto mt-8 max-w-md space-y-3 text-left text-base text-slate-700 md:max-w-lg md:text-lg dark:text-slate-300">
              {[
                "Leads don't respond.",
                "Follow-ups are too slow.",
                "And high-intent clients choose someone else.",
              ].map((text, i) => (
                <RevealSection key={text} delay={i * 100}>
                  <li className="flex gap-3 border-l-4 border-rose-200 pl-4 dark:border-rose-800">
                    <span className="font-semibold text-rose-600 dark:text-rose-400">→</span>
                    <span>{text}</span>
                  </li>
                </RevealSection>
              ))}
            </ul>
            <p className="mt-10 font-heading text-lg font-bold leading-snug text-rose-800 md:text-xl dark:text-rose-300">
              Every missed response is a lost commission.
            </p>
          </RevealSection>
        </section>

        {/* SOLUTION */}
        <section
          id="solution"
          className="border-y border-emerald-100 bg-gradient-to-b from-emerald-50/95 via-white to-emerald-50/40 px-6 py-16 md:py-20 dark:border-emerald-900/30 dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-900/50"
        >
          <RevealSection className="mx-auto max-w-3xl text-center">
            <h2 className="font-heading text-2xl font-bold leading-tight text-slate-900 md:text-3xl lg:text-[2rem] dark:text-white">
              RealtyBoss fixes the entire pipeline.
            </h2>
            <p className="mt-5 text-lg font-semibold text-slate-800 md:text-xl dark:text-slate-200">
              From first click to final deal —{" "}
              <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">handled by AI.</span>
            </p>
            <ul className="mx-auto mt-10 max-w-md space-y-4 text-left text-base font-medium text-slate-800 md:max-w-lg md:text-lg dark:text-slate-200">
              {[
                { text: "No more chasing.", tone: "primary" as const },
                { text: "No more guessing.", tone: "success" as const },
                { text: "No more missed opportunities.", tone: "accent" as const },
              ].map((item, i) => (
                <RevealSection key={item.text} delay={i * 100}>
                  <li className="flex items-start gap-3 rounded-xl border border-emerald-100/80 bg-white/80 px-4 py-3 shadow-sm shadow-emerald-900/5 transition-all duration-200 hover:shadow-md dark:border-emerald-900/40 dark:bg-slate-800/60">
                    <BrandCheck tone={item.tone} />
                    <span>{item.text}</span>
                  </li>
                </RevealSection>
              ))}
            </ul>
          </RevealSection>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="px-6 py-16 dark:bg-slate-950">
          <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2">
            <RevealSection>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl dark:text-white">How It Works</h2>
              <ul className="mt-6 space-y-4 text-gray-600 dark:text-slate-400">
                {(
                  [
                    { n: 1, label: "Attract traffic", tone: "primary" as const },
                    { n: 2, label: "Capture leads", tone: "primaryDark" as const },
                    { n: 3, label: "AI follows up instantly", tone: "success" as const },
                    { n: 4, label: "You close the deal", tone: "accent" as const },
                  ] as const
                ).map((step, i) => (
                  <RevealSection key={step.n} delay={i * 80}>
                    <li className="flex gap-3">
                      <BrandCheck tone={step.tone} size="md" />
                      <span className="pt-0.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{step.n}.</span> {step.label}
                      </span>
                    </li>
                  </RevealSection>
                ))}
              </ul>
            </RevealSection>
            <RevealSection delay={150} className="flex min-h-[16rem] items-center justify-center">
              <figure className="w-full max-w-xl lg:max-w-none">
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 transition-all duration-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/40">
                  <Image
                    src="/images/ProcessDiagram.png"
                    alt="How RealtyBoss works: from traffic through capture and nurture to closed deals"
                    width={1200}
                    height={800}
                    className="h-auto w-full object-contain"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
                <figcaption className="sr-only">
                  Process diagram: attract traffic, capture leads, AI follow-up, and you close the deal.
                </figcaption>
              </figure>
            </RevealSection>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="bg-slate-50/70 px-6 py-16 md:py-20 dark:bg-slate-900/30">
          <div className="mx-auto max-w-7xl">
            <RevealSection className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                The deal workflow
              </p>
              <h2 className="mt-2 font-heading text-2xl font-semibold md:text-3xl dark:text-white">
                Capture → Qualify → Convert → <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">Coach</span>
              </h2>
              <p className="mt-3 text-base text-gray-600 md:text-lg dark:text-slate-400">
                Every stage of the deal — from first reply to closing table to next year&apos;s 15th transaction — runs on real-estate-native AI. Not a generic sales CRM with AI sprinkled on.
              </p>
            </RevealSection>
            {/*
             * Deal workflow cards — replaces the prior generic CRM grid
             * (Follow-Up / Scoring / Pipeline / Drips) with the four
             * stages that actually map to how a real estate deal closes.
             * The fourth card surfaces RealtyBoss Coaching, which is
             * the genuine moat: nobody else bundles a coaching program
             * with annual transaction targets into the CRM tier.
             */}
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {([
                {
                  step: "1",
                  accent: "primary",
                  icon: <Zap size={22} strokeWidth={2} aria-hidden />,
                  title: "Capture",
                  description:
                    "Reply to every lead in under 60 seconds — Zillow, Facebook, your site, missed calls. Source-aware AI replies, not generic templates.",
                  bullets: [
                    "SMS + email + voice in 60s",
                    "Click-to-call (Twilio bridge)",
                    "Missed-call text-back",
                  ],
                  chipBg: "bg-blue-50",
                  chipText: "text-[#0072ce]",
                },
                {
                  step: "2",
                  accent: "primaryDark",
                  icon: <Target size={22} strokeWidth={2} aria-hidden />,
                  title: "Qualify",
                  description:
                    "Stop spending time on tire-kickers. Behavioral scoring + sphere prediction + equity signals tell you who's actually ready to transact.",
                  bullets: [
                    "Hot / warm / cold scoring",
                    "Sphere + equity signals",
                    "Buyer Broker Agreement (BBA) workflow",
                  ],
                  chipBg: "bg-violet-50",
                  chipText: "text-violet-600",
                },
                {
                  step: "3",
                  accent: "success",
                  icon: <TrendingUp size={22} strokeWidth={2} aria-hidden />,
                  title: "Convert",
                  description:
                    "Move qualified buyers to closing without leaving the dashboard. Tours, offers, video email, e-sign, and transaction coordination — all on one timeline.",
                  bullets: [
                    "Tour booking + offer tracking",
                    "Video email (record & send)",
                    "E-sign + wire-fraud SMS",
                  ],
                  chipBg: "bg-emerald-50",
                  chipText: "text-emerald-600",
                },
                {
                  step: "4",
                  accent: "accent",
                  icon: <GraduationCap size={22} strokeWidth={2} aria-hidden />,
                  title: "Coach",
                  badge: "Included on Pro+",
                  description:
                    "RealtyBoss Coaching turns the dashboard into a producer-development program. Daily plans, weekly playbooks, monthly reviews — tied to a real annual transaction target.",
                  bullets: [
                    "Producer Track: 10 deals / 3% conv",
                    "Top Producer Track: 15 deals / 5% conv",
                    "AI deep-dives + peer benchmarks",
                  ],
                  chipBg: "bg-amber-50",
                  chipText: "text-amber-600",
                },
              ] as {
                step: string;
                accent: "primary" | "primaryDark" | "success" | "accent";
                icon: ReactNode;
                title: string;
                description: string;
                bullets: string[];
                chipBg: string;
                chipText: string;
                badge?: string;
              }[]).map((f, i) => (
                <RevealSection key={f.title} delay={i * 100}>
                  <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/[0.06] dark:border-slate-700 dark:bg-slate-900 dark:hover:shadow-[#0072ce]/[0.08]">
                    {/* Gradient overlay on hover */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0072ce]/[0.02] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="mb-5 flex items-start justify-between gap-2">
                      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.chipBg} ${f.chipText}`}>
                        {f.icon}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Step {f.step}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">{f.title}</h3>
                      {f.badge ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#0072ce] ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-[#4da3e8] dark:ring-blue-800">
                          {f.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {f.description}
                    </p>
                    <ul className="mt-5 space-y-2">
                      {f.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300"
                        >
                          <BrandCheck tone={f.accent} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </RevealSection>
              ))}
            </div>

            {/* Coaching deep-link — surfaces the marketing surface for
              * Producer Track / Top Producer Track. The FAQ + comparison
              * pages already point here; the landing should too. */}
            <RevealSection delay={400} className="mt-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Curious about the coaching tracks?{" "}
                <Link
                  href="/agent/coaching"
                  className="font-semibold text-[#0072ce] hover:underline dark:text-[#4da3e8]"
                >
                  See how Producer Track + Top Producer Track work →
                </Link>
              </p>
            </RevealSection>
          </div>
        </section>

        {/*
         * SOCIAL PROOF — removed until we have real testimonials with
         * full names + headshots + brokerage.
         *
         * The previous version used "Marcus T. / Priya R. / Jason M."
         * with city + initials, which is the canonical pattern for
         * fabricated stock testimonials. For a CRM that sells "trust our
         * AI with your leads," placeholder social proof is actively
         * harmful — it signals the product isn't real and undermines
         * every other trust signal on the page. Better to have NO
         * testimonials than ones that look fake.
         *
         * When to restore: once we have at least 3 real customers
         * willing to be quoted with full name, real headshot photo,
         * brokerage logo/name, and ideally a LinkedIn link. Optionally
         * add a "Case studies" link or pilot results block in the
         * meantime (clearly labeled as internal data, not a customer).
         */}

        {/* PRICING */}
        <section id="pricing" className="px-6 py-16 md:py-20 dark:bg-slate-950">
          <div className="mx-auto max-w-7xl text-center">
            <RevealSection>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl dark:text-white">Start Closing Deals Today</h2>
              <p className="mt-2 text-gray-600 dark:text-slate-400">Simple pricing. No contracts. Cancel anytime.</p>
            </RevealSection>

            {/*
             * Monthly / Annual billing toggle. Annual = monthly × 10
             * (two months free, ~17% savings). Pricing is computed
             * inline per-card from the cycle state so we don't have
             * to maintain a separate plan table.
             */}
            <RevealSection delay={50}>
              <div className="mt-8 flex flex-col items-center gap-3">
                <div
                  role="tablist"
                  aria-label="Billing cycle"
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={billingCycle === "monthly"}
                    onClick={() => setBillingCycle("monthly")}
                    className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                      billingCycle === "monthly"
                        ? "bg-gradient-to-r from-[#0072ce] to-[#4F46E5] text-white shadow"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={billingCycle === "annual"}
                    onClick={() => setBillingCycle("annual")}
                    className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                      billingCycle === "annual"
                        ? "bg-gradient-to-r from-[#0072ce] to-[#4F46E5] text-white shadow"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    Annual
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        billingCycle === "annual"
                          ? "bg-white/20 text-white"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      Save 17%
                    </span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {billingCycle === "annual"
                    ? "Billed yearly — two months free vs monthly"
                    : "Switch to annual billing for 2 months free"}
                </p>
              </div>
            </RevealSection>

            <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {/* Starter (internal plan_type: "free") */}
              <RevealSection delay={0}>
                <Card className="h-full dark:border-slate-700 dark:bg-slate-900">
                  <CardContent className="p-5 text-left">
                    <h3 className="font-heading text-base font-semibold dark:text-white">Starter</h3>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">$0 <span className="text-xs font-normal text-gray-500 dark:text-slate-400">forever</span></p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">For new agents testing the platform.</p>
                    <ul className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {[
                        "Up to 5 leads · 50 contacts",
                        "2 CMA reports / day",
                        "AI SMS + email responder (basic)",
                        "Click-to-call (Twilio bridge)",
                        "100 AI actions / month",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2"><BrandCheck tone="primary" />{f}</li>
                      ))}
                    </ul>
                    <Button className="mt-5 w-full text-xs" variant="outline" href="/signup" aria-label="Get started — Starter plan at $0 per month">Get started</Button>
                  </CardContent>
                </Card>
              </RevealSection>
              {/* Pro — Featured */}
              <RevealSection delay={100}>
                <Card className="relative h-full scale-[1.02] border-2 border-[#0072ce] ring-2 ring-[#0072ce]/10 dark:border-[#4da3e8] dark:bg-slate-900 dark:ring-[#0072ce]/20">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#0072ce] to-[#4F46E5] px-3 py-0.5 text-xs font-semibold text-white shadow-md">Most Popular</div>
                  <CardContent className="p-5 text-left">
                    <h3 className="font-heading text-base font-semibold dark:text-white">Pro</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${billingCycle === "annual" ? 66 : 79}{" "}
                        <span className="text-xs font-normal text-gray-500 dark:text-slate-400">/mo</span>
                      </p>
                      {billingCycle === "annual" && (
                        <span className="text-xs font-normal text-gray-400 line-through dark:text-slate-500">$79</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-500">
                      {billingCycle === "annual" ? "$790 billed yearly" : "Billed monthly"}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">For active agents closing deals consistently.</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-[#0072ce] ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-[#4da3e8] dark:ring-blue-800">
                      ★ RealtyBoss Coaching: Producer Track included
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {[
                        "500 leads · 500 contacts",
                        "Bilingual English / 中文 templates & AI",
                        "Producer Track coaching (auto-enrolled)",
                        "Video email (record & send)",
                        "Buyer Broker Agreement workflow",
                        "Sphere + equity signals",
                        "5,000 AI actions / month",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2"><BrandCheck tone="primary" />{f}</li>
                      ))}
                    </ul>
                    <Button className="mt-5 w-full text-xs shadow-lg shadow-[#0072ce]/20" href={`/agent/pricing?checkout_plan=pro&cycle=${billingCycle}`} aria-label={`Start free trial — Pro plan at $${billingCycle === "annual" ? 66 : 79} per month`}>Start 14-day trial</Button>
                    <p className="mt-1.5 text-center text-[11px] text-gray-400 dark:text-slate-500">Cancel anytime during the trial</p>
                  </CardContent>
                </Card>
              </RevealSection>
              {/* Elite */}
              <RevealSection delay={200}>
                <Card className="h-full dark:border-slate-700 dark:bg-slate-900">
                  <CardContent className="p-5 text-left">
                    <h3 className="font-heading text-base font-semibold dark:text-white">Premium</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${billingCycle === "annual" ? 166 : 199}{" "}
                        <span className="text-xs font-normal text-gray-500 dark:text-slate-400">/mo</span>
                      </p>
                      {billingCycle === "annual" && (
                        <span className="text-xs font-normal text-gray-400 line-through dark:text-slate-500">$199</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-500">
                      {billingCycle === "annual" ? "$1,990 billed yearly" : "Billed monthly"}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">For top producers running solo.</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800">
                      ★ RealtyBoss Coaching: Top Producer Track included
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {[
                        "Unlimited leads & contacts",
                        "Top Producer Track coaching",
                        "ISA workflow + qualified handoff",
                        "E-signature (Dotloop / DocuSign)",
                        "Unlimited AI actions",
                        "Priority support",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2"><BrandCheck tone="success" />{f}</li>
                      ))}
                    </ul>
                    <Button className="mt-5 w-full text-xs" variant="outline" href={`/agent/pricing?checkout_plan=premium&cycle=${billingCycle}`} aria-label={`Start free trial — Premium plan at $${billingCycle === "annual" ? 166 : 199} per month`}>Start 14-day trial</Button>
                  </CardContent>
                </Card>
              </RevealSection>
              {/* Team */}
              <RevealSection delay={300}>
                <Card className="h-full dark:border-slate-700 dark:bg-slate-900">
                  <CardContent className="p-5 text-left">
                    <h3 className="font-heading text-base font-semibold dark:text-white">Team</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${billingCycle === "annual" ? 249 : 299}{" "}
                        <span className="text-xs font-normal text-gray-500 dark:text-slate-400">/mo</span>
                      </p>
                      {billingCycle === "annual" && (
                        <span className="text-xs font-normal text-gray-400 line-through dark:text-slate-500">$299</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-500">
                      {billingCycle === "annual" ? "$2,990 billed yearly · per team" : "Billed monthly · per team"}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">For brokerages and small teams up to 5 seats.</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800">
                      ★ RealtyBoss Coaching: Top Producer Track for every seat
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {[
                        "Up to 5 team seats",
                        "Round-robin lead routing",
                        "Per-member breakdown reporting",
                        "Roster-wide dashboard rollups",
                        "Top Producer Track for every member",
                        "Team owner controls + seat invites",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2"><BrandCheck tone="accent" />{f}</li>
                      ))}
                    </ul>
                    <Button className="mt-5 w-full text-xs" variant="outline" href={`/agent/pricing?checkout_plan=team&cycle=${billingCycle}`} aria-label={`Start free trial — Team plan at $${billingCycle === "annual" ? 249 : 299} per month`}>Start 14-day trial</Button>
                    <p className="mt-1.5 text-center text-[11px] text-gray-400 dark:text-slate-500">More than 5 seats? <a href="/contact?topic=team" className="underline hover:text-slate-600 dark:hover:text-slate-300">Contact sales</a></p>
                  </CardContent>
                </Card>
              </RevealSection>
            </div>

            {/* Signature teaser — full ladder lives on /agent/pricing */}
            <RevealSection>
              <div className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 px-5 py-4 text-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-900/10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                      Signature
                    </span>
                    <span className="ml-2 font-semibold text-slate-900 dark:text-amber-100">
                      $399/mo
                    </span>
                    <span className="ml-2 text-slate-700 dark:text-amber-200/80">
                      — bilingual + luxury concierge tier with Sphere Intelligence Pro, white-glove onboarding, cultural calendar automations, custom voice tuning.
                    </span>
                  </div>
                  <a
                    href="/agent/pricing"
                    className="text-sm font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-300"
                  >
                    See Signature details →
                  </a>
                </div>
              </div>
            </RevealSection>

            <p className="mt-6 text-sm text-gray-500 dark:text-slate-400">
              From your first lead to your highest-value clients — available in English and 中文. See the full feature comparison →{" "}
              <a href="/agent/pricing" className="font-semibold text-[#0072ce] hover:underline dark:text-[#4da3e8]">View all plans</a>
            </p>
          </div>
        </section>

        {/* HOW WE COMPARE */}
        <section id="compare" className="bg-slate-50 px-6 py-16 md:py-20 dark:bg-slate-900/30">
          <div className="mx-auto max-w-5xl text-center">
            <RevealSection>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl dark:text-white">
                How we stack up vs. the rest
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-gray-600 dark:text-slate-400">
                RealtyBoss vs. Follow Up Boss, kvCORE, Lofty, BoomTown, LionDesk, and Sierra Interactive — at a fraction of the price.
              </p>
            </RevealSection>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "AI-native, not retrofitted",
                  body: "Coaching, deal coach, equity-based outreach — built in, not a 'with AI' add-on.",
                },
                {
                  title: "Half the price",
                  body: "$79–$199/mo covers what BoomTown / kvCORE / Lofty charge $500–$1,500/mo for.",
                },
                {
                  title: "Bilingual + WeChat",
                  body: "中文 templates, WeChat + Xiaohongshu paths, Advisor sales-model. Nobody else does this.",
                },
                {
                  title: "Modern stack = fast shipping",
                  body: "We added 15+ gap-closing features in a month. Legacy CRMs ship features quarterly.",
                },
              ].map((it, i) => (
                <RevealSection key={it.title} delay={i * 60}>
                  <div className="h-full rounded-xl border border-slate-200/80 bg-white p-5 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="font-heading text-sm font-semibold text-slate-900 dark:text-white">{it.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{it.body}</p>
                  </div>
                </RevealSection>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button href="/agent/compare" className="px-6 py-2.5 text-sm">
                See full comparison
              </Button>
              <Button variant="outline" href="/agent/pricing" className="px-6 py-2.5 text-sm">
                View pricing
              </Button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-slate-50 px-6 py-16 md:py-20 dark:bg-slate-900/30">
          <div className="mx-auto max-w-3xl">
            <RevealSection>
              <h2 className="text-center font-heading text-2xl font-semibold md:text-3xl dark:text-white">Common Questions</h2>
            </RevealSection>
            <div className="mt-10 space-y-6">
              {[
                {
                  q: "How does the AI follow-up actually work?",
                  a: "When a new lead comes in from any source — your website, Zillow, Facebook, etc. — RealtyBoss sends a personalized text and email within 60 seconds. The message is tailored to where they came from and what they were looking at. If they reply, AI continues the conversation and qualifies them before handing off to you.",
                },
                {
                  q: "Does it integrate with my current CRM or website?",
                  a: "Yes. RealtyBoss connects with major real estate CRMs (Follow Up Boss, kvCORE, Sierra Interactive, and more) via Zapier or native integrations. Your website lead forms, Zillow, and Facebook Lead Ads all flow in automatically. Setup typically takes under 15 minutes.",
                },
                {
                  q: "What happens after the free trial?",
                  a: "You choose a plan — or you don't. There's no auto-charge after the trial ends. If you upgrade to Pro, your leads, sequences, and pipeline history carry over seamlessly. If you stay on the Starter plan, you keep up to 25 leads/month with core features.",
                },
                {
                  q: "Will leads know they're talking to AI?",
                  a: "RealtyBoss is designed to be transparent. Messages are sent in your name and from your number. When a lead is ready to connect, you're looped in immediately. You can customize exactly how much AI handles before you take over.",
                },
                {
                  q: "How is this different from a standard CRM?",
                  a: "Most CRMs track what happened. RealtyBoss acts on it. Instead of logging a lead and setting a manual reminder, our AI sends the first message, qualifies the lead, books a call if they're ready, and only escalates to you when there's real buying intent — saving you hours every week.",
                },
              ].map((item, i) => (
                <RevealSection key={i} delay={i * 60}>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">{item.q}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.a}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="relative overflow-hidden py-24 text-center text-white md:py-32">
          <div className="absolute inset-0 -z-10 bg-gray-950" />
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-[100px]" style={{ background: "conic-gradient(from 0deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #7c3aed 240deg, #0072ce 360deg)" }} />
          </div>
          <RevealSection>
            <h2 className="font-heading text-3xl font-extrabold md:text-4xl lg:text-5xl">Close more deals. Become a top producer.</h2>
            <p className="mt-4 text-lg text-gray-400">
              The AI deal engine + coaching program built for real estate. No setup, no contracts, 14-day trial.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button className="shadow-xl shadow-[#0072ce]/20 px-8 py-3 text-base" href={primaryCtaHref}>
                Get My First Leads
              </Button>
              <Button variant="inverse" href="/pricing" className="px-8 py-3 text-base">
                Compare Plans
              </Button>
            </div>
          </RevealSection>
        </section>

        {/* Footer is rendered by AppShell's marketing-home branch so
            every public page (landing + features + about + calculators
            + legal) shares the same `components/Footer.tsx`. Keeping
            this comment as a breadcrumb because the inline footer
            that used to live here was confusingly bigger than the
            global one. */}
      </main>

      <ExitIntentPopup role="agent" />
    </>
  );
}

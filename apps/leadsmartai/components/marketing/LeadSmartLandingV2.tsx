"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, type MouseEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  ChartBar,
  CheckCircle2,
  Clock,
  Filter,
  Globe2,
  HandHeart,
  LineChart,
  MessagesSquare,
  PhoneMissed,
  Settings2,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandCheck } from "@/components/brand/BrandCheck";

type LandingT = (key: string, options?: Record<string, unknown>) => string;

const ExitIntentPopup = dynamic(
  () => import("@/components/marketing/ExitIntentPopup"),
  { ssr: false },
);

/**
 * V2 conversion-focused landing.
 *
 * Replaces the long-form V1 narrative with a tighter funnel:
 *   Hero (problem-aware) → How It Works (visual flow) → Growth
 *   Engine (5 product pillars) → Sales Style Engine (the
 *   differentiator) → Results → Why us (comparison table) → ROI
 *   nudge → Final CTA. The footer comes from the global
 *   `AppShell` `<Footer />`, so this file ends at the final CTA.
 *
 * Section anchors are paired with the in-page nav so the hash links
 * jump smoothly. `/features` and `/pricing` are full routes — the
 * dedicated pages carry the depth that doesn't fit on the landing.
 */

const PRIMARY_CTA_HREF = "/onboarding";

/**
 * Buyer & seller deliverables surfaced on the landing. Hardcoded English
 * (new section; not yet in the i18n bundles) — concise, benefit-first.
 */
const AI_TOOLS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: ChartBar,
    title: "AI CMA",
    body: "Pull live comparable sales and a defensible value range in minutes — grounded in real web sources, not guesswork.",
  },
  {
    icon: Sparkles,
    title: "Seller Presentation",
    body: "A branded listing presentation — comps, pricing strategy, marketing plan, schools, and your profile — generated from one address.",
  },
  {
    icon: LineChart,
    title: "Property Deep Report",
    body: "A complete buyer-decision report: loan affordability, deal rating, investment ROI, schools, neighborhood, and a location map.",
  },
  {
    icon: Filter,
    title: "AI House Search",
    body: "Describe what a buyer wants in plain English; get matched listings and email the best ones to them in a click.",
  },
  {
    icon: Globe2,
    title: "Comparison Report",
    body: "Score properties side-by-side on price, value, and fit so buyers can decide with confidence — shareable by link.",
  },
  {
    icon: HandHeart,
    title: "Net-to-Seller Sheet",
    body: "A clean, signable net-proceeds summary so sellers see exactly what they walk away with before they accept.",
  },
];

/* JUMP_LINKS removed — the in-page jump-link strip was deleted when
 * the marketing chrome switched from a left sidebar to a horizontal
 * top nav. Restore (with the i18n keys that still exist under
 * `web_landing.jump.*`) if we re-add a soft in-page TOC inside the
 * hero. */

/**
 * Scroll-triggered reveal — `motion`'s `whileInView` watches the
 * element via IntersectionObserver and runs the transition on the
 * compositor thread. `once: true` keeps the animation from re-firing
 * on every scroll-back; `amount: 0.18` requires ~18% of the element
 * visible before triggering, mirroring the threshold of the previous
 * hand-rolled hook.
 *
 * The transition is a spring (not a linear ease) so the entrance
 * settles with the slight overshoot Linear/Vercel use on their
 * landing pages — `stiffness: 90, damping: 22` gives a ~700ms total
 * motion that doesn't feel either bouncy or sluggish.
 *
 * `useReducedMotion()` short-circuits all animation when the user
 * has the OS-level preference set; equivalent to the existing
 * `prefers-reduced-motion` CSS guard but read at render time so the
 * variants don't run at all.
 */
function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18, margin: "0px 0px -10% 0px" }}
      transition={{
        type: "spring",
        stiffness: 90,
        damping: 22,
        delay: delay / 1000,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Magnetic CTA wrapper — the button gently follows the cursor when
 * the user hovers within a ~28px field around it, then springs back
 * to center on leave. The pull is small (max ±10px) so the click
 * target stays predictable. Wraps `<Button>` so the underlying
 * primitive keeps all its existing styling, focus management, and
 * accessibility wiring; this only adds the motion shell.
 *
 * Honors `prefers-reduced-motion` by skipping the spring entirely
 * and rendering the children inline — keyboard users and anyone
 * with the OS toggle on get a static button with no surprise.
 */
function MagneticButton({
  children,
  strength = 0.35,
}: {
  children: ReactNode;
  /** 0..1 — fraction of the cursor distance the button follows. */
  strength?: number;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // `useSpring` smooths the cursor follow so the button doesn't snap
  // to every micro-movement; the spring config is intentionally
  // light so it feels like a gentle pull, not a tether.
  const sx = useSpring(x, { stiffness: 250, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 250, damping: 22, mass: 0.4 });

  if (reduceMotion) {
    return <>{children}</>;
  }

  function onMove(event: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    x.set(dx * strength);
    y.set(dy * strength);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy, display: "inline-block" }}
    >
      {children}
    </motion.div>
  );
}

export default function LeadSmartLandingV2() {
  const { t } = useTranslation("web_landing");
  return (
    <>
      <div className="-mx-4 bg-white text-gray-900 sm:-mx-8 dark:bg-slate-950 dark:text-slate-100">
        {/* The legacy in-page "Jump to" strip lived here. It was
            removed when the marketing chrome moved from a left
            sidebar to a horizontal top nav — the strip now read as
            a duplicate nav bar stacked under the real one. In-page
            anchors (#how, #results, #why) still resolve because
            the sections below set those `id`s. If we want a softer
            in-page TOC again in the future, render it inline within
            the hero (not as a top-bar) so it doesn't compete with
            the global top nav. */}

        {/* ── HERO ─── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
          <div
            className="pointer-events-none absolute inset-0 -z-0"
            aria-hidden
          >
            <div
              className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.15] blur-[100px] dark:opacity-[0.08]"
              style={{
                background:
                  "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)",
              }}
            />
          </div>
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 md:grid-cols-2 md:gap-12 md:py-28">
            <div className="max-w-xl lg:max-w-2xl">
              {/* Trust line — names brokerages whose agents use
                  the platform. Phrased as "Trusted by [Brokerage]
                  agents" (modifying "agents") rather than "Trusted
                  by [Brokerage]" (which would imply brokerage-
                  level endorsement we don't have). Layer in a
                  customer count once we have one: "Trusted by
                  200+ RE/MAX agents, Coldwell Banker agents, …". */}
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t("hero.trust_line")}
              </p>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0072ce]/20 bg-white/80 px-4 py-1.5 text-xs font-medium text-[#0072ce] shadow-sm backdrop-blur-sm dark:border-[#0072ce]/30 dark:bg-slate-900/80 dark:text-[#4da3e8]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0072ce] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0072ce]" />
                </span>
                {t("hero.badge")}
              </div>
              <h1 className="font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-950 md:text-5xl lg:text-[3.25rem] dark:text-white">
                {t("hero.h1_prefix")}
                <span className="bg-gradient-to-r from-[#0072ce] via-[#4F46E5] to-[#7c3aed] bg-clip-text text-transparent">
                  {t("hero.h1_highlight")}
                </span>
                {t("hero.h1_suffix")}
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-gray-600 md:text-xl dark:text-slate-400">
                {t("hero.subtitle")}
              </p>

              {/* Hero proof bullets — Missed Call Recovery sits in
                  the middle slot so it lands right after the speed
                  promise. This is placement 1 of 3 for Missed Call
                  Recovery (also dedicated feature section and mid-
                  page emotional hook strip further down). */}
              <ul className="mt-7 space-y-2.5 text-base text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-0.5 text-lg">⚡</span>
                  <span>{t("hero.bullets.speed")}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-0.5 text-lg">📞</span>
                  <span>{t("hero.bullets.missed_call")}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-0.5 text-lg">🎯</span>
                  <span>{t("hero.bullets.focus")}</span>
                </li>
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <MagneticButton>
                  <Button
                    href={PRIMARY_CTA_HREF}
                    className="min-h-[48px] px-7 text-base shadow-floating hover:shadow-overlay"
                  >
                    {t("hero.cta_primary")}
                  </Button>
                </MagneticButton>
                <Button
                  variant="outline"
                  href="/login?next=/book"
                  className="min-h-11 px-6 text-base"
                >
                  Schedule a Demo
                </Button>
                <Button
                  variant="outline"
                  href="#how"
                  className="min-h-11 px-6 text-base"
                >
                  {t("hero.cta_secondary")}
                </Button>
              </div>

              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                {t("hero.trial_note")}
              </p>
            </div>

            {/* Dashboard preview mockup */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl shadow-slate-900/[0.1] dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="ml-2 text-[10px] font-medium text-slate-400">
                  {t("mock.live_label")}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                    {t("mock.auto_replying")}
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2">
                  <DashStat n="12" l={t("mock.stats.new_leads")} tone="blue" />
                  <DashStat n="94%" l={t("mock.stats.reply_rate")} tone="green" />
                  <DashStat n="8" l={t("mock.stats.tours_booked")} tone="violet" />
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: "Sarah M.", statusKey: "hot" as const, emoji: "🔥", timeKey: "two_min_ago" as const },
                    { name: "James W.", statusKey: "warm" as const, emoji: "💬", timeKey: "fifteen_min_ago" as const },
                    { name: "Lisa K.", statusKey: "new" as const, emoji: "✨", timeKey: "one_hour_ago" as const },
                  ].map((lead) => (
                    <div
                      key={lead.name}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-700/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{lead.emoji}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {lead.name}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                            lead.statusKey === "hot"
                              ? "bg-orange-100 text-orange-700"
                              : lead.statusKey === "warm"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {t(`mock.lead_status.${lead.statusKey}`)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{t(`mock.time.${lead.timeKey}`)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                    <span>{t("mock.pipeline_health")}</span>
                    <span>72%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#0072ce] to-[#4F46E5]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS STRIP ───
            First scroll target after the hero. Four quantified
            claims — three product specs + one industry stat (47%
            first-responder advantage). Every number is defensible
            without customer data; swap real customer-outcome
            numbers in once the beta cohort produces them. */}
        <section className="bg-white px-6 py-12 dark:bg-slate-950 md:py-14">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              {t("stats_strip.eyebrow")}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              {(
                [
                  "response",
                  "first_responder",
                  "voice_ai",
                  "starting_price",
                ] as const
              ).map((key) => (
                <div key={key} className="text-center">
                  <dt className="font-heading text-3xl font-extrabold leading-none tracking-tight md:text-4xl">
                    <span className="bg-gradient-to-r from-[#0072ce] via-[#4F46E5] to-[#7c3aed] bg-clip-text text-transparent">
                      {t(`stats_strip.items.${key}.value`)}
                    </span>
                  </dt>
                  <dd className="mt-2 text-sm leading-snug text-slate-600 dark:text-slate-300">
                    {t(`stats_strip.items.${key}.label`)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── BROKERAGE LOGO STRIP ───
            Social-proof row: brokerage names whose agents use the
            platform, framed as nominative reference ("Trusted by
            agents at …") not endorsement. Wordmarks are styled in
            grayscale via the BrokerageWordmark component below.
            Swap each <BrokerageWordmark> for a real <Image> or
            inline SVG once we pull official logos from each
            brokerage's brand kit. */}
        <section className="border-b border-slate-200/80 bg-slate-50/50 px-6 py-10 dark:border-slate-800 dark:bg-slate-900/30 md:py-12">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t("brokerage_strip.eyebrow")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-14">
              <BrokerageWordmark name="RE/MAX" logoSrc="/images/brokerages/Remax.png" />
              <BrokerageWordmark name="COLDWELL BANKER" logoSrc="/images/brokerages/ColdwellBanker.svg" />
              <BrokerageWordmark name="KELLER WILLIAMS" logoSrc="/images/brokerages/KW.png" />
              <BrokerageWordmark name="CENTURY 21" logoSrc="/images/brokerages/Century21.png" />
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─── */}
        <section
          id="how"
          className="border-y border-slate-200/80 bg-slate-50/70 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("how.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("how.h2_prefix")}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
                  {t("how.h2_highlight")}
                </span>
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t("how.body")}
              </p>
            </RevealSection>

            <RevealSection delay={120} className="mt-12">
              <FlowDiagram
                steps={[
                  { label: t("how.flow.traffic"), icon: Globe2, tone: "slate" },
                  { label: t("how.flow.ai_capture"), icon: Filter, tone: "blue" },
                  { label: t("how.flow.ai_qualify"), icon: Sparkles, tone: "violet" },
                  { label: t("how.flow.ai_follow_up"), icon: MessagesSquare, tone: "amber" },
                  { label: t("how.flow.agent"), icon: HandHeart, tone: "emerald" },
                  { label: t("how.flow.deal_closed"), icon: CheckCircle2, tone: "green" },
                ]}
              />
            </RevealSection>
          </div>
        </section>

        {/* ── GROWTH ENGINE (5 pillars, bento layout) ───
            4-column grid on lg+, where `follow_up` is the featured
            tile (gradient background, brand ring, larger icon). The
            asymmetric layout — 2 small + 1 wide on row 1, 2 wide on
            row 2 — is the "bento" idiom Apple/Vercel use to break the
            row-of-equal-boxes feel of a standard product grid.
            Falls back to a stacked 1-col on mobile, 2-col on md. */}
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto max-w-7xl">
            <RevealSection className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("growth.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("growth.h2")}
              </h2>
            </RevealSection>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {GROWTH_ENGINE.map((p, i) => {
                const isFeatured = p.key === "follow_up";
                const colSpan = PILLAR_BENTO_SPANS[p.key];
                return (
                  <RevealSection
                    key={p.key}
                    delay={i * 80}
                    className={colSpan}
                  >
                    <div
                      className={
                        // Featured tile gets a brand-tinted gradient
                        // background + brand ring; standard tiles
                        // stay on plain surface with the shared
                        // shadow-raised treatment from globals.css.
                        isFeatured
                          ? "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-[#0072ce]/[0.08] via-white to-white p-6 shadow-raised ring-1 ring-[#0072ce]/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-overlay md:p-8 dark:from-[#0072ce]/[0.18] dark:via-slate-900 dark:to-slate-900 dark:ring-[#0072ce]/40"
                          : "group relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-raised transition-all duration-300 hover:-translate-y-1 hover:shadow-floating dark:border-slate-700 dark:bg-slate-900"
                      }
                    >
                      {/* Conic-gradient halo behind the featured card —
                          subtle radial glow that only appears on the
                          follow_up tile to reinforce its hierarchy. */}
                      {isFeatured ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl dark:opacity-20"
                          style={{
                            background:
                              "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)",
                          }}
                        />
                      ) : null}
                      <div className="relative mb-4 flex items-center justify-between">
                        <div
                          className={`inline-flex items-center justify-center rounded-xl ${p.chip.bg} ${p.chip.text} ${
                            isFeatured ? "h-14 w-14" : "h-12 w-12"
                          }`}
                        >
                          <p.icon
                            size={isFeatured ? 26 : 22}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {t("growth.step_label", { step: p.step })}
                        </span>
                      </div>
                      <div className="relative flex items-baseline gap-2">
                        <span aria-hidden className={isFeatured ? "text-2xl" : "text-xl"}>
                          {p.emoji}
                        </span>
                        <h3
                          className={`font-heading font-bold text-slate-900 dark:text-white ${
                            isFeatured ? "text-lg md:text-xl" : "text-base"
                          }`}
                        >
                          {t(`growth.pillars.${p.key}.title`)}
                        </h3>
                      </div>
                      <p
                        className={`relative mt-2 flex-1 leading-relaxed text-slate-600 dark:text-slate-400 ${
                          isFeatured ? "text-base" : "text-sm"
                        }`}
                      >
                        {t(`growth.pillars.${p.key}.tagline`)}
                      </p>
                      <ul className="relative mt-5 space-y-2">
                        {p.bullets.map((bulletKey) => (
                          <li
                            key={bulletKey}
                            className={`flex items-center gap-2.5 text-slate-700 dark:text-slate-300 ${
                              isFeatured ? "text-sm" : "text-xs"
                            }`}
                          >
                            <BrandCheck tone={p.checkTone} />
                            {t(`growth.pillars.${p.key}.bullets.${bulletKey}`)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </RevealSection>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── MISSED CALL RECOVERY AI™ — placement 2 of 3 ───
            Sits right after the Growth Engine grid because it
            structurally belongs to the Follow Up pillar (which is
            card #3 in the grid above). Full-width amber gradient
            card so it reads as a featured / signature feature, not
            yet-another-grid-card. Concise vs. the /features page
            version — the landing should tease, the features page
            sells. */}
        <section
          id="missed-call-recovery"
          className="border-y border-amber-200/70 bg-gradient-to-b from-white via-amber-50/40 to-white px-6 py-20 dark:border-amber-900/40 dark:from-slate-950 dark:via-amber-950/15 dark:to-slate-950 md:py-24"
        >
          <div className="mx-auto max-w-5xl">
            <RevealSection>
              <div className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:gap-12">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    {t("missed_call.badge")}
                  </span>
                  <h2 className="mt-5 font-heading text-3xl font-bold leading-tight text-amber-900 md:text-4xl dark:text-amber-200">
                    {t("missed_call.h2")}
                  </h2>
                  <p className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
                    {t("missed_call.tagline")}
                  </p>
                </div>
                <div className="space-y-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    {t("missed_call.body_p1_prefix")}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {t("missed_call.body_p1_emphasis")}
                    </span>
                  </p>
                  <p>{t("missed_call.body_p2")}</p>
                  <ul className="grid gap-2 pt-2 sm:grid-cols-2">
                    {(["text_back", "sms_convo", "qualification", "handoff"] as const).map((featureKey) => (
                      <li
                        key={featureKey}
                        className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2 text-sm text-slate-700 backdrop-blur dark:border-amber-800/50 dark:bg-slate-900/60 dark:text-slate-300"
                      >
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                          aria-hidden
                        />
                        <span>{t(`missed_call.features.${featureKey}`)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Link
                      href="/features#follow-up"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 hover:underline dark:text-amber-300"
                    >
                      {t("missed_call.cta")}
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("missed_call.included_note")}
                    </span>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── SALES STYLE ENGINE ─── */}
        <section className="border-y border-slate-200/80 bg-gradient-to-b from-white via-blue-50/30 to-white px-6 py-20 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:py-24">
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("styles.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("styles.h2")}
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t("styles.subtitle")}
              </p>
            </RevealSection>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {SALES_STYLES.map((s, i) => (
                <RevealSection key={s.key} delay={i * 100}>
                  <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${s.chip.bg} ${s.chip.text} text-2xl`}>
                      {s.emoji}
                    </div>
                    <h3 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">
                      {t(`styles.${s.key}.name`)}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {t(`styles.${s.key}.body`)}
                    </p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t("styles.best_for_label")} <span className="text-slate-700 dark:text-slate-200">{t(`styles.${s.key}.best_for`)}</span>
                    </p>
                  </div>
                </RevealSection>
              ))}
            </div>

            <RevealSection delay={400} className="mt-10 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t("styles.tagline")}
              </p>
            </RevealSection>
          </div>
        </section>

        {/* ── RESULTS ─── */}
        <section
          id="results"
          className="px-6 py-20 md:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("results.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("results.h2_prefix")}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
                  {t("results.h2_highlight")}
                </span>
              </h2>
            </RevealSection>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {RESULTS.map((r, i) => (
                <RevealSection key={r.key} delay={i * 100}>
                  <div className="flex h-full flex-col rounded-2xl border-2 border-slate-200/80 bg-white p-7 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <span aria-hidden className="text-3xl">
                      {r.emoji}
                    </span>
                    <p className="mt-3 font-heading text-4xl font-extrabold text-[#0072ce] md:text-5xl">
                      {t(`results.${r.key}.value`)}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t(`results.${r.key}.label`)}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {t(`results.${r.key}.body`)}
                    </p>
                  </div>
                </RevealSection>
              ))}
            </div>

            <RevealSection delay={400} className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
              <p>{t("results.disclaimer")}</p>
            </RevealSection>
          </div>
        </section>

        {/* ── MISSED CALL HOOK STRIP — placement 3 of 3 ───
            Scroll-stopping emotional break between Results and Why
            Us. Single bold line + short body + inline CTA so it
            interrupts the page rhythm without becoming yet another
            full-content section. Pairs with the hero bullet and the
            dedicated section above. */}
        <section
          aria-label={t("missed_call_hook.section_a11y")}
          className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-6 py-12 text-white md:py-14"
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 text-center md:flex-row md:gap-8 md:text-left">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 md:inline-flex">
              <PhoneMissed size={26} strokeWidth={2.25} aria-hidden />
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-2xl font-bold leading-tight md:text-3xl">
                <span aria-hidden className="mr-2 md:hidden">⚡</span>
                {t("missed_call_hook.h3")}
              </h3>
              <p className="mt-2 text-sm text-white/90 md:text-base">
                {t("missed_call_hook.body")}
              </p>
            </div>
            <Link
              href="#missed-call-recovery"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-amber-700 shadow-md transition hover:bg-slate-50 md:text-base"
            >
              {t("missed_call_hook.cta")}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>

        {/* ── WHY US (comparison table) ─── */}
        <section
          id="why"
          className="border-y border-slate-200/80 bg-slate-50/70 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24"
        >
          <div className="mx-auto max-w-5xl">
            <RevealSection className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("why.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("why.h2_prefix")}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
                  {t("why.h2_highlight")}
                </span>
              </h2>
            </RevealSection>

            <RevealSection delay={120} className="mt-10">
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t("why.col_traditional")}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0072ce] dark:text-[#4da3e8]">
                        {t("why.col_us")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {COMPARISON_KEYS.map((rowKey) => (
                      <tr key={rowKey}>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                          <span className="mr-2 text-slate-400">✕</span>
                          {t(`why.rows.${rowKey}.left`)}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                          <span className="mr-2 text-emerald-600">✓</span>
                          {t(`why.rows.${rowKey}.right`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── ROI ─── */}
        <section className="bg-gradient-to-b from-rose-50/80 via-white to-white px-6 py-20 dark:from-rose-950/15 dark:via-slate-950 dark:to-slate-950 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <RevealSection>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-400">
                {t("roi.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold leading-tight text-slate-900 md:text-4xl dark:text-white">
                {t("roi.h2_prefix")}
                <span className="text-rose-700 dark:text-rose-400">{t("roi.h2_highlight")}</span>
                {t("roi.h2_suffix")}
              </h2>
              <p className="mt-5 text-base text-slate-700 dark:text-slate-300 md:text-lg">
                {t("roi.body")}
              </p>
            </RevealSection>

            <RevealSection delay={120}>
              <ul className="mx-auto mt-8 max-w-md space-y-3 text-left text-base text-slate-700 dark:text-slate-300">
                {(["first_responder", "broken_sequences", "equity_threshold"] as const).map((bulletKey) => (
                  <li
                    key={bulletKey}
                    className="flex items-start gap-3 border-l-4 border-rose-200 pl-4 dark:border-rose-800"
                  >
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      →
                    </span>
                    <span>{t(`roi.bullets.${bulletKey}`)}</span>
                  </li>
                ))}
              </ul>
            </RevealSection>

            <RevealSection delay={220}>
              <p className="mt-8 font-heading text-lg font-bold text-slate-900 md:text-xl dark:text-white">
                {t("roi.fix_line")}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button href={PRIMARY_CTA_HREF} className="min-h-11 px-6 text-base">
                  {t("roi.cta_primary")}
                </Button>
                <Button
                  variant="outline"
                  href="/agent/pricing"
                  className="min-h-11 px-6 text-base"
                >
                  {t("roi.cta_secondary")}
                </Button>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── AI TOOLS (buyer & seller deliverables) ─── */}
        <section id="tools" className="border-t border-slate-200/80 bg-slate-50/50 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24">
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0072ce] dark:text-[#4da3e8]">
                AI tools for buyers &amp; sellers
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                Win the listing. Guide the buyer.
              </h2>
              <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                Beyond the CRM — generate the reports and searches that close deals, each grounded in live web data and branded with your profile.
              </p>
            </RevealSection>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {AI_TOOLS.map((tool, i) => (
                <RevealSection key={tool.title} delay={i * 60}>
                  <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#0072ce] dark:bg-slate-800 dark:text-[#4da3e8]">
                      <tool.icon size={22} aria-hidden />
                    </div>
                    <h3 className="mt-4 font-heading text-base font-bold text-slate-900 dark:text-white">
                      {tool.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {tool.body}
                    </p>
                  </div>
                </RevealSection>
              ))}
            </div>

            <RevealSection className="mt-10 text-center">
              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0072ce] hover:underline dark:text-[#4da3e8]"
              >
                See everything in the platform
                <ArrowRight size={16} aria-hidden />
              </Link>
            </RevealSection>
          </div>
        </section>

        {/* ── FINAL CTA ─── */}
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] px-8 py-14 text-center text-white shadow-2xl md:px-12">
            <RevealSection>
              <h2 className="font-heading text-3xl font-bold leading-tight md:text-4xl">
                {t("final.h2")}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-white/90 md:text-lg">
                {t("final.subtitle")}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href={PRIMARY_CTA_HREF}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0072ce] shadow-lg transition hover:bg-slate-50 md:text-base"
                >
                  {t("final.cta_primary")}
                  <ArrowRight size={18} aria-hidden />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 md:text-base"
                >
                  {t("final.cta_secondary")}
                </Link>
              </div>
              <p className="mt-6 text-xs text-white/70">
                {t("final.footer_note")}
              </p>
            </RevealSection>
          </div>
        </section>

        {/* Footer is provided by AppShell. Topbar + sidebar are too —
            this component renders inside the shared marketing chrome
            from `components/AppShell.tsx`. */}
      </div>

      <ExitIntentPopup role="agent" />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Sub-components + content tables
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Brokerage wordmark — renders a real logo image when one exists in
 * `public/images/brokerages/`, falls back to a text wordmark
 * otherwise. The image render is grayscaled by default with a
 * full-color hover state so the row reads as a uniform "logo wall."
 *
 * To add a new brokerage: drop the logo PNG/SVG into
 * `public/images/brokerages/<filename>` and pass `logoSrc` to this
 * component. Keep image heights uniform (~32px) so the row stays
 * visually balanced.
 */
function BrokerageWordmark({
  name,
  logoSrc,
}: {
  name: string;
  /** Optional. Public path to a logo file, e.g. "/images/brokerages/Remax.png". */
  logoSrc?: string;
}) {
  if (logoSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoSrc}
        alt={name}
        loading="lazy"
        className="h-8 w-auto max-w-[160px] select-none object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-10"
      />
    );
  }
  return (
    <span
      aria-label={name}
      className="select-none text-base font-bold uppercase tracking-[0.18em] text-slate-500 opacity-70 transition hover:opacity-100 dark:text-slate-400 md:text-lg"
    >
      {name}
    </span>
  );
}

function DashStat({ n, l, tone }: { n: string; l: string; tone: "blue" | "green" | "violet" }) {
  const palette = {
    blue: { color: "text-[#0072ce]", bg: "bg-[#0072ce]/5" },
    green: { color: "text-emerald-600", bg: "bg-emerald-50" },
    violet: { color: "text-[#4F46E5]", bg: "bg-[#4F46E5]/5" },
  }[tone];
  return (
    <div className={`rounded-xl ${palette.bg} p-3 text-center dark:bg-slate-700/50`}>
      <p className={`text-2xl font-extrabold ${palette.color}`}>{n}</p>
      <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400">{l}</p>
    </div>
  );
}

type FlowTone = "slate" | "blue" | "violet" | "amber" | "emerald" | "green";

const FLOW_TONE: Record<FlowTone, { bg: string; text: string; border: string }> = {
  slate: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200 dark:border-slate-700" },
  blue: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-[#0072ce] dark:text-[#4da3e8]", border: "border-blue-200 dark:border-blue-800" },
  violet: { bg: "bg-violet-50 dark:bg-violet-900/30", text: "text-violet-600 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800" },
  amber: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  green: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
};

/**
 * Visual workflow flow: 6 nodes connected by arrows. Wraps to two
 * rows on narrow viewports (3+3). Each node is a vertical stack of
 * icon + label so it stays readable at small sizes.
 */
function FlowDiagram({
  steps,
}: {
  steps: { label: string; icon: LucideIcon; tone: FlowTone }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-6 md:gap-2">
      {steps.map((s, i) => {
        const palette = FLOW_TONE[s.tone];
        return (
          <div key={s.label} className="relative flex flex-col items-center text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${palette.border} ${palette.bg} ${palette.text}`}
            >
              <s.icon size={26} strokeWidth={2} aria-hidden />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {s.label}
            </p>
            {/* Arrow to the next node — desktop only (the wrapping
                grid handles mobile flow direction). */}
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute right-[-12px] top-7 hidden text-slate-300 md:block dark:text-slate-600"
              >
                <ArrowRight size={18} strokeWidth={2.25} />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type PillarKey = "capture" | "qualify" | "follow_up" | "convert" | "scale";
type GrowthPillar = {
  key: PillarKey;
  step: string;
  emoji: string;
  bullets: string[];
  icon: LucideIcon;
  chip: { bg: string; text: string };
  checkTone: "primary" | "primaryDark" | "success" | "accent";
};

/**
 * Bento layout map — at `lg` (4-col grid):
 *   Row 1: [capture: 1] [qualify: 1] [follow_up: 2, featured tile]
 *   Row 2: [convert: 2] [scale: 2]
 *
 * This produces 3 tiles on row 1 and 2 wide tiles on row 2, the
 * asymmetric "bento" rhythm. At `md` (2-col), every tile gets
 * `md:col-span-1`; mobile is 1-col stacked.
 */
const PILLAR_BENTO_SPANS: Record<PillarKey, string> = {
  capture: "md:col-span-1 lg:col-span-1",
  qualify: "md:col-span-1 lg:col-span-1",
  follow_up: "md:col-span-2 lg:col-span-2",
  convert: "md:col-span-2 lg:col-span-2",
  scale: "md:col-span-2 lg:col-span-2",
};

/**
 * Pillar metadata: text resolves per-render via
 * `t(\`growth.pillars.${key}.title\`)` etc. Bullets are key suffixes so
 * the same key list can drive both the JSX render and translation
 * lookups.
 */
const GROWTH_ENGINE: GrowthPillar[] = [
  {
    key: "capture",
    step: "1",
    emoji: "🧲",
    bullets: ["landing", "home_value", "forms", "crm"],
    icon: Filter,
    chip: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-[#0072ce] dark:text-[#4da3e8]" },
    checkTone: "primary",
  },
  {
    key: "qualify",
    step: "2",
    emoji: "⚡",
    bullets: ["scoring", "intent", "enrichment"],
    icon: Sparkles,
    chip: { bg: "bg-violet-50 dark:bg-violet-900/30", text: "text-violet-600 dark:text-violet-300" },
    checkTone: "primaryDark",
  },
  {
    key: "follow_up",
    step: "3",
    emoji: "🤖",
    bullets: ["automation", "instant", "triggers"],
    icon: Bot,
    chip: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-300" },
    checkTone: "accent",
  },
  {
    key: "convert",
    step: "4",
    emoji: "💬",
    bullets: ["engine", "suggestions", "booking"],
    icon: MessagesSquare,
    chip: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300" },
    checkTone: "success",
  },
  {
    key: "scale",
    step: "5",
    emoji: "📈",
    bullets: ["analytics", "optimization", "workflows"],
    icon: LineChart,
    chip: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300" },
    checkTone: "primaryDark",
  },
];

type StyleKey = "consultative" | "closer" | "connector";

const SALES_STYLES: Array<{
  key: StyleKey;
  emoji: string;
  chip: { bg: string; text: string };
}> = [
  {
    key: "consultative",
    emoji: "🤝",
    chip: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-[#0072ce] dark:text-[#4da3e8]" },
  },
  {
    key: "closer",
    emoji: "⚡",
    chip: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-300" },
  },
  {
    key: "connector",
    emoji: "💬",
    chip: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300" },
  },
];

type ResultKey = "appointments" | "speed" | "conversion";

const RESULTS: Array<{ key: ResultKey; emoji: string }> = [
  { key: "appointments", emoji: "📈" },
  { key: "speed", emoji: "⚡" },
  { key: "conversion", emoji: "💰" },
];

const COMPARISON_KEYS = [
  "manual_followup",
  "generic_crm",
  "missed_after_hours",
  "disconnected",
  "no_coaching",
] as const;

// Suppress unused-import lint when icons are referenced inline above.
// (TypeScript doesn't flag, but keep these so future edits don't
// accidentally remove the imports.)
void Zap;
void TrendingUp;
void Workflow;
void ChartBar;
void CalendarCheck;
void Settings2;
void Clock;

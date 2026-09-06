"use client";

import Link from "next/link";
import Image from "next/image";
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
  Headphones,
  LineChart,
  MessagesSquare,
  PhoneCall,
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
 * Section data is structural only (icons + i18n keys); all copy lives in the
 * `web_landing` bundle (en + zh-Hans) and is resolved with `t()` in the render
 * so the whole landing stays bilingual. See `kill_crm`, `chores`, `ai_tools`.
 */

/** The "we killed the CRM" contrast — i18n row keys under `kill_crm.rows`. */
const KILL_CRM_ROWS = ["acts", "one_command", "cold_call", "trained", "you_close"] as const;

/** Buyer & seller deliverables — icon + i18n key under `ai_tools.items`. */
const AI_TOOLS: Array<{ icon: LucideIcon; key: string }> = [
  { icon: ChartBar, key: "cma" },
  { icon: Sparkles, key: "seller_presentation" },
  { icon: LineChart, key: "deep_report" },
  { icon: Filter, key: "house_search" },
  { icon: Globe2, key: "comparison" },
  { icon: HandHeart, key: "net_to_seller" },
];

/** "Chores we kill" — i18n item keys under `chores.items`. */
const CHORES_KILLED = [
  "cma",
  "presentation",
  "research",
  "home_match",
  "deal_math",
  "social",
  "leads",
  "missed_calls",
  "cold_call",
] as const;

/** "Sell faster / find faster" value props — i18n keys under `faster.sell|buy.items`. */
const SELL_FASTER = ["playbook", "ai_machine", "all_tools", "vigorous"] as const;
const BUY_FASTER = ["auto_criteria", "ai_machine"] as const;

/**
 * The CloseBoss AI team — the six branded assistants, introduced at the top of
 * the page. Names + portraits match the in-app roster (lib/closeboss/team.ts,
 * /avatars/personas). Copy is brand content, kept inline (not i18n) for now.
 */
/*
 * Identity only — the persona name and the color that identifies it. Role and
 * one-liner are copy and live in `web_landing.team.members.*`; holding them
 * here made all six cards render English under a Chinese heading, because a
 * module constant is evaluated once, before any locale is known.
 */
const AI_TEAM_MEMBERS = [
  { id: "max", name: "Max", color: "#6C5BD0" },
  { id: "emma", name: "Emma", color: "#E86FA6" },
  { id: "chris", name: "Chris", color: "#2F6FE0" },
  { id: "ruby", name: "Ruby", color: "#E68A2E" },
  { id: "grace", name: "Grace", color: "#2E9E6B" },
  { id: "oliver", name: "Oliver", color: "#3A6E8F" },
] as const;

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
            anchors (#how, #why) still resolve because the sections
            below set those `id`s. If we want a softer
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
              {/* Trust line. Deliberately names no brokerage: the logo
                  strip that did was removed because we cannot substantiate
                  it. If a named brokerage goes back on this page it needs a
                  real customer behind it, and nominative phrasing —
                  "Trusted by [Brokerage] agents", modifying "agents" — not
                  "Trusted by [Brokerage]", which claims an endorsement. */}
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
                  {t("mock.example_label")}
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

        {/* ── ASK MAX ─── the captain, introduced right after the hero */}
        <section
          id="team"
          className="border-b border-slate-200/80 bg-white px-6 py-20 dark:border-slate-800 dark:bg-slate-950 md:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">{t("team.eyebrow")}</p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("team.h2_prefix")}{" "}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">{t("team.h2_highlight")}</span>
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">{t("team.sub")}</p>
            </RevealSection>

            {/* The team lineup */}
            <RevealSection delay={100} className="mt-10">
              <Image
                src="/brand/closeboss/ai-team.png"
                alt={t("team.image_alt")}
                width={1536}
                height={1024}
                sizes="(max-width: 896px) 100vw, 896px"
                className="mx-auto h-auto w-full max-w-4xl rounded-2xl border border-slate-200 shadow-xl dark:border-slate-800"
              />
            </RevealSection>

            {/* Profile cards */}
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {AI_TEAM_MEMBERS.map((m, i) => (
                <RevealSection key={m.id} delay={(i % 3) * 80}>
                  <div className="flex h-full items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                    <Image
                      src={`/avatars/personas/${m.id}.png`}
                      alt={m.name}
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-full border-2 object-cover"
                      style={{ borderColor: m.color, backgroundColor: "#0b1424" }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                          {m.name}
                        </h3>
                        {/* Label text is a neutral accessible tone, not the
                            persona hex — the raw persona colors (e.g. pink
                            #E86FA6, orange #E68A2E, green #2E9E6B) fail WCAG AA
                            as 10px text on their own 10% tint (2.6–3.4:1). The
                            persona color still identifies the assistant via the
                            avatar ring + chip tint below. */}
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200"
                          style={{ backgroundColor: `${m.color}1A` }}
                        >
                          {t(`team.members.${m.id}.role`)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {t(`team.members.${m.id}.line`)}
                      </p>
                    </div>
                  </div>
                </RevealSection>
              ))}
            </div>

            <RevealSection delay={200} className="mt-10 text-center">
              <MagneticButton>
                <Button
                  href={PRIMARY_CTA_HREF}
                  className="min-h-[48px] px-7 text-base shadow-floating hover:shadow-overlay"
                >{t("team.cta")}</Button>
              </MagneticButton>
            </RevealSection>
          </div>
        </section>

        {/* ── STATS STRIP ───
            First scroll target after the hero. Four quantified
            claims — three product specs + one industry stat (47%
            first-responder advantage). Every number is defensible
            without customer data; swap real customer-outcome
            numbers in once the beta cohort produces them. */}
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto max-w-6xl">
            <RevealSection className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
                {t("chores.eyebrow")}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
                {t("chores.h2")}
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t("chores.body")}
              </p>
            </RevealSection>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CHORES_KILLED.map((key, i) => (
                <RevealSection
                  key={key}
                  delay={(i % 3) * 90}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
                >
                  <p className="text-sm font-semibold text-slate-400 line-through decoration-rose-400/50 dark:text-slate-500">
                    {t(`chores.items.${key}.chore`)}
                  </p>
                  <div className="mt-3 flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t(`chores.items.${key}.fix`)}</p>
                  </div>
                  <span className="mt-4 inline-flex w-fit rounded-full bg-[#0072ce]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0072ce]">
                    {t(`chores.items.${key}.who`)}
                  </span>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── SPEAKS YOUR CLIENTS' LANGUAGE ─── every assistant converses in
            the client's language, by voice and text; bilingual is a core
            differentiator for multicultural markets. */}
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
                  { label: t("how.flow.traffic"), icon: PhoneCall, tone: "slate" },
                  { label: t("how.flow.ai_capture"), icon: Headphones, tone: "blue" },
                  { label: t("how.flow.ai_qualify"), icon: CalendarCheck, tone: "violet" },
                  { label: t("how.flow.ai_follow_up"), icon: TrendingUp, tone: "amber" },
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
                  href="/book"
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

    </>
  );
}

/**
 * Homepage entity FAQ. Google's AI Overview currently confuses "CloseBoss AI"
 * with the similarly-named "CloseBot", so this section gives first-party,
 * domain-anchored definition text (visible on the page) mirrored by FAQPage
 * JSON-LD — the clearest signal we can send that closebossai.com is a distinct
 * real-estate product. Kept in English (the SEO-target locale) on purpose; the
 * visible copy MUST match the schema per Google's structured-data rules.
 */
const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: "What is CloseBoss AI?",
    a: "CloseBoss AI (closebossai.com) is an AI-powered real estate team built for real estate agents. It answers every inbound call with an AI receptionist, follows up with every lead by phone and text, coordinates transactions, and runs your social media marketing — the work of a full team, alongside a single agent. It is a distinct product built specifically for real estate professionals.",
  },
  {
    q: "Who is CloseBoss AI for?",
    a: "CloseBoss AI is for real estate agents and teams who want to answer every call, follow up with every lead, and stay on top of every transaction without hiring more staff.",
  },
  {
    q: "What does CloseBoss AI do?",
    a: "CloseBoss AI gives an agent a team of AI assistants: an AI receptionist that answers calls 24/7, a sales assistant that calls and texts every lead, a transaction coordinator that keeps deals on track, and a marketing assistant that publishes social content — all managed from one dashboard at closebossai.com.",
  },
  {
    q: "How is CloseBoss AI different from a chatbot?",
    a: "CloseBoss AI is not a single chatbot. It is a coordinated AI real estate team: instead of one bot answering questions, it handles calls, lead follow-up, transaction coordination, and marketing together, purpose-built for how real estate agents actually work.",
  },
];

function FaqSection() {
  const { t } = useTranslation("web_landing");
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <section id="faq" className="px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{t("faq.h2")}</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("faq.sub")}</p>
        <dl className="mt-8 space-y-4">
          {HOME_FAQ.map((f) => (
            <div
              key={f.q}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40"
            >
              <dt className="text-base font-semibold text-slate-900 dark:text-white">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Sub-components + content tables
 * ──────────────────────────────────────────────────────────────────── */


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

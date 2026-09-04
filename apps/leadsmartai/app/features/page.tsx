import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Globe2,
  Headphones,
  House,
  Megaphone,
  MessageCircle,
  Mic,
  PhoneCall,
  PhoneMissed,
  PhoneOutgoing,
  Receipt,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import CommandChainDiagram from "@/components/marketing/CommandChainDiagram";
import { getServerT } from "@/lib/i18n/server";
import { FEATURE_PAGES } from "@/lib/marketing/features";

const FEATURE_ICONS: Record<string, LucideIcon> = {
  receptionist: Headphones,
  sales: TrendingUp,
  marketing: Megaphone,
  transaction: ClipboardList,
  cma: BarChart3,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tf = (key: string): string => t(key, { ns: "web_features" });
  return {
    title: tf("meta.title"),
    description: tf("meta.description"),
    keywords: [
      "AI real estate team",
      "AI receptionist real estate",
      "AI voice calls real estate",
      "missed call text back",
      "real estate AI assistant",
      "real estate virtual assistant",
    ],
    alternates: { canonical: "/features" },
    openGraph: {
      title: tf("meta.og_title"),
      description: tf("meta.og_description"),
      url: "/features",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: tf("meta.twitter_title"),
      description: tf("meta.twitter_description"),
    },
  };
}

const PRIMARY_CTA_HREF = "/onboarding";

const BRAND = "#0072ce";

type TeamMemberKey =
  | "receptionist"
  | "boss"
  | "sales"
  | "marketing"
  | "transaction"
  | "accountant";

type TeamMember = {
  key: TeamMemberKey;
  icon: LucideIcon;
  accent: string; // tailwind text + bg tones
  voice?: boolean;
};

const TEAM: TeamMember[] = [
  {
    key: "receptionist",
    icon: Headphones,
    accent: "bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]",
    voice: true,
  },
  {
    key: "boss",
    icon: House,
    accent: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
  },
  {
    key: "sales",
    icon: TrendingUp,
    accent: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    key: "marketing",
    icon: Megaphone,
    accent: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    key: "transaction",
    icon: ClipboardList,
    accent: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
  },
  {
    key: "accountant",
    icon: Receipt,
    accent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
];

type VoicePointKey =
  | "sphere_followup"
  | "cold_call"
  | "answers_live"
  | "language"
  | "text_back"
  | "books"
  | "every_call";

const VOICE_POINTS: Array<{ key: VoicePointKey; icon: LucideIcon; outbound?: boolean }> = [
  { key: "sphere_followup", icon: PhoneOutgoing, outbound: true },
  { key: "cold_call", icon: PhoneOutgoing },
  { key: "answers_live", icon: PhoneCall },
  { key: "language", icon: Globe2 },
  { key: "text_back", icon: PhoneMissed },
  { key: "books", icon: CalendarCheck },
  { key: "every_call", icon: MessageCircle },
];

type ToolKey = "cma" | "seller_presentation" | "deep_report" | "house_search";

const TOOLS: Array<{ key: ToolKey; icon: LucideIcon }> = [
  { key: "cma", icon: BarChart3 },
  { key: "seller_presentation", icon: Sparkles },
  { key: "deep_report", icon: BarChart3 },
  { key: "house_search", icon: House },
];

type TrainingKey = "scripts" | "objections" | "cadence" | "pricing";

const TRAINING_POINTS: Array<{ key: TrainingKey; icon: LucideIcon }> = [
  { key: "scripts", icon: MessageCircle },
  { key: "objections", icon: CheckCircle2 },
  { key: "cadence", icon: CalendarCheck },
  { key: "pricing", icon: TrendingUp },
];

const ECON_CHIPS = ["no_payroll", "never_quits", "always_on", "trained"] as const;

export default async function FeaturesPage() {
  const t = await getServerT();
  const tf = (key: string): string => t(key, { ns: "web_features" });
  /* AppShell owns the marketing chrome (top nav + footer); this page
   * emits only its section content. */
  return (
    <>
      {/* ── HERO ─── */}
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-slate-50 via-white to-white px-6 py-20 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 md:py-28">
        <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
          <div
            className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.13] blur-[100px] dark:opacity-[0.08]"
            style={{
              background:
                "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)",
            }}
          />
        </div>
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">
            {tf("hero.eyebrow")}
          </p>
          <h1 className="mt-4 font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-950 md:text-5xl lg:text-[3.25rem] dark:text-white">
            {tf("hero.h1_lead")}{" "}
            <span className="bg-gradient-to-r from-[#0072ce] via-[#4F46E5] to-[#7c3aed] bg-clip-text text-transparent">
              {tf("hero.h1_gradient")}
            </span>
            <br className="hidden md:inline" /> {tf("hero.h1_tail")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-400">
            {tf("hero.subtitle")}
          </p>

          {/* Team chips */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {TEAM.map((m) => (
              <span
                key={m.key}
                className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
              >
                {tf(`team.${m.key}.name`)}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-[#0072ce]/20 transition hover:bg-[#005ba8] hover:shadow-xl"
            >
              {tf("hero.cta_primary")}
              <ArrowRight size={18} aria-hidden />
            </Link>
            {/*
              "Hear it answer a call" has to actually let you hear it answer a
              call. This pointed at /contact — a lead form — so the one CTA on
              the page that offers proof instead of a claim delivered neither.
              /voice-ai-test-drive is the live demo the label describes: it
              rings your phone with the AI, no signup. It existed the whole
              time, linked from two blog posts and nothing else.
            */}
            <Link
              href="/voice-ai-test-drive"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {tf("hero.cta_secondary")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── VOICE SPOTLIGHT — the differentiator ─── */}
      <section className="border-b border-slate-200/70 bg-gradient-to-b from-blue-50/60 via-white to-white px-6 py-20 dark:border-slate-800 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-950 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-[#0072ce]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#0072ce]">
                <Mic size={13} aria-hidden /> {tf("voice.badge")}
              </p>
              <h2 className="mt-4 font-heading text-3xl font-bold leading-tight text-slate-900 md:text-4xl dark:text-white">
                {tf("voice.h2_lead")}{" "}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
                  {tf("voice.h2_gradient")}
                </span>
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {tf("voice.body_lead")}{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{tf("voice.body_bold")}</span>{" "}
                {tf("voice.body_tail")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={PRIMARY_CTA_HREF}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#005ba8]"
                >
                  {tf("voice.cta")}
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {VOICE_POINTS.map((v) => (
                <div
                  key={v.key}
                  className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-slate-900 ${
                    v.outbound
                      ? "border-[#0072ce]/40 ring-1 ring-[#0072ce]/20 sm:col-span-2 dark:border-[#0072ce]/40"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
                      <v.icon size={20} aria-hidden />
                    </div>
                    {v.outbound ? (
                      <span className="rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0072ce]">
                        {tf("voice.only_badge")}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-heading text-sm font-bold text-slate-900 dark:text-white">
                    {tf(`voice.points.${v.key}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {tf(`voice.points.${v.key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MEET THE TEAM ─── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              {tf("meet.eyebrow")}
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              {tf("meet.h2")}
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
              {tf("meet.subtitle")}
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM.map((m) => (
              <div
                key={m.key}
                className={`relative h-full rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 ${
                  m.voice
                    ? "border-[#0072ce]/40 ring-1 ring-[#0072ce]/20 dark:border-[#0072ce]/40"
                    : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                {m.voice ? (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0072ce]">
                    <Mic size={11} aria-hidden /> {tf("meet.voice_badge")}
                  </span>
                ) : null}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.accent}`}>
                  <m.icon size={22} aria-hidden />
                </div>
                <h3 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">
                  {tf(`team.${m.key}.name`)}
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-[#0072ce] dark:text-[#4da3e8]">
                  {tf(`team.${m.key}.role`)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {tf(`team.${m.key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EXPLORE EACH FEATURE (internal links to /features/{slug}) ── */}
      <section className="border-t border-slate-200/80 bg-slate-50/70 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">{t("pages.features.exploreTeam", { ns: "dashboard" })}</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">{t("pages.features.closerLook", { ns: "dashboard" })}</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_PAGES.map((f) => {
              const FIcon = FEATURE_ICONS[f.icon] ?? Sparkles;
              return (
                <Link
                  key={f.slug}
                  href={`/features/${f.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
                    <FIcon size={22} aria-hidden />
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">
                    {f.name}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {f.eyebrow}.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0072ce] dark:text-[#4da3e8]">{t("pages.features.learnMore", { ns: "dashboard" })}<ArrowRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TRAINED ON TOP AGENTS ── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              {tf("training.eyebrow")}
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              {tf("training.h2")}
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
              {tf("training.subtitle")}
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRAINING_POINTS.map((p) => (
              <div
                key={p.key}
                className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
                  <p.icon size={20} aria-hidden />
                </div>
                <h3 className="mt-4 font-heading text-sm font-bold text-slate-900 dark:text-white">
                  {tf(`training.points.${p.key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {tf(`training.points.${p.key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIRTUALLY FREE (economics) ── */}
      <section className="border-y border-slate-200/80 bg-gradient-to-b from-blue-50/60 via-white to-white px-6 py-20 dark:border-slate-800 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-950 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
            {tf("economics.eyebrow")}
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
            {tf("economics.h2_lead")}{" "}
            <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
              {tf("economics.h2_gradient")}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-400 md:text-lg">
            {tf("economics.subtitle")}
          </p>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
            {ECON_CHIPS.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <CheckCircle2 size={15} className="text-emerald-500" aria-hidden />
                {tf(`economics.chips.${chip}`)}
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-[#0072ce]/20 transition hover:bg-[#005ba8]"
            >
              {tf("economics.cta")}
              <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── COMMAND CHAIN (interactive) ── */}
      <section className="border-y border-slate-200/80 bg-slate-50/70 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              {tf("command_chain.eyebrow")}
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              {tf("command_chain.h2")}
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
              {tf("command_chain.subtitle")}
            </p>
            <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#0072ce]/10 px-4 py-1.5 text-sm font-semibold text-[#0072ce] dark:text-[#4da3e8]">
              {tf("command_chain.hint")}
            </p>
          </div>
          <div className="mt-12">
            <CommandChainDiagram />
          </div>
        </div>
      </section>

      {/* ── TOOLS the team brings ─── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
            {tf("tools.eyebrow")}
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
            {tf("tools.h2")}
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {TOOLS.map((tool) => (
              <span
                key={tool.key}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <tool.icon size={16} className="text-[#0072ce]" aria-hidden />
                {tf(`tools.items.${tool.key}`)}
              </span>
            ))}
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {tf("tools.extra")}
            </span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] px-8 py-14 text-center text-white shadow-2xl md:px-12">
          <h2 className="font-heading text-3xl font-bold leading-tight md:text-4xl">
            {tf("final_cta.h2")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 md:text-lg">
            {tf("final_cta.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0072ce] shadow-lg transition hover:bg-slate-50 md:text-base"
              style={{ color: BRAND }}
            >
              {tf("final_cta.primary")}
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 md:text-base"
            >
              {tf("final_cta.secondary")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

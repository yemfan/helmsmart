import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
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

export const metadata: Metadata = {
  title: "Your AI Real Estate Team — RealtorBoss",
  description:
    "RealtorBoss is an AI team for real estate agents — an AI receptionist that answers every call, a sales assistant that follows up, plus marketing, transaction, and accounting assistants. Never miss a call or a lead again.",
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
    title: "Your AI Real Estate Team — RealtorBoss",
    description:
      "An AI team that answers the phone, follows up, markets your listings, coordinates the deal, and keeps the books.",
    url: "/features",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your AI Real Estate Team — RealtorBoss",
    description: "An AI team that answers the phone, follows up, and closes.",
  },
};

const PRIMARY_CTA_HREF = "/onboarding";

const BRAND = "#0072ce";

type TeamMember = {
  name: string;
  role: string;
  body: string;
  icon: LucideIcon;
  accent: string; // tailwind text + bg tones
  voice?: boolean;
};

const TEAM: TeamMember[] = [
  {
    name: "AI Receptionist",
    role: "Answers every call — 24/7",
    body: "Picks up live calls, qualifies the caller, books showings and appointments, and texts back instantly when you can't answer. Your phone is never unattended again.",
    icon: Headphones,
    accent: "bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]",
    voice: true,
  },
  {
    name: "Boss Assistant",
    role: "Your chief of staff",
    body: "You're the boss — just say what you want done. Your Boss Assistant figures out who should handle it, delegates to the right teammate, and reports back. One command in; the whole team to work.",
    icon: House,
    accent: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
  },
  {
    name: "Sales Assistant",
    role: "Follows up & converts",
    body: "Follows up with a real voice call — not just an SMS — plus text and email. Runs CMAs and listing presentations, searches homes for buyers, and never lets a sphere touch slip.",
    icon: TrendingUp,
    accent: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    name: "Marketing Assistant",
    role: "Fills your pipeline",
    body: "Generates leads, nurtures your sphere, and keeps you visible — campaigns, content, and outreach that bring new business while you work the ones you have.",
    icon: Megaphone,
    accent: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    name: "Transaction Assistant",
    role: "Coordinates to close",
    body: "Drives every deal from accepted offer to keys — coordinator board, offers, and a per-deal coach for pricing, risk, and negotiation.",
    icon: ClipboardList,
    accent: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
  },
  {
    name: "Accountant",
    role: "Keeps the books",
    body: "Invoices, expenses, and commission tracking — so you always know what's earned, what's owed, and what closed.",
    icon: Receipt,
    accent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
];

const VOICE_POINTS: Array<{ icon: LucideIcon; title: string; body: string; outbound?: boolean }> = [
  {
    icon: PhoneOutgoing,
    title: "Calls your sphere to follow up",
    body: "This is the part no other CRM does: your AI places real voice calls to past clients and leads — check-ins, nurture, market updates — by phone, not just another text.",
    outbound: true,
  },
  {
    icon: PhoneCall,
    title: "Answers live, in your voice",
    body: "A natural AI voice picks up inbound calls, answers questions about a listing, and qualifies the caller — day or night.",
  },
  {
    icon: PhoneMissed,
    title: "Missed-call text-back",
    body: "Can't pick up? The moment a call ends unanswered, the caller gets a friendly text in seconds — before they call the next agent.",
  },
  {
    icon: CalendarCheck,
    title: "Books showings & appointments",
    body: "Captures intent and puts the appointment on your calendar, then hands a qualified lead to the Sales Assistant.",
  },
  {
    icon: MessageCircle,
    title: "Every call becomes a lead",
    body: "Inbound and outbound calls are logged, transcribed, and added to your pipeline automatically — no sticky notes, no lost numbers.",
  },
];

const DAY_FLOW: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Call comes in", icon: PhoneCall },
  { label: "Receptionist answers + qualifies", icon: Headphones },
  { label: "Sales follows up", icon: TrendingUp },
  { label: "Transaction coordinates", icon: ClipboardList },
  { label: "Deal closes", icon: CheckCircle2 },
];

const TOOLS: Array<{ icon: LucideIcon; title: string }> = [
  { icon: BarChart3, title: "AI CMA" },
  { icon: Sparkles, title: "Seller Presentation" },
  { icon: BarChart3, title: "Property Deep Report" },
  { icon: House, title: "AI House Search" },
];

export default function FeaturesPage() {
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
            Not a CRM — a team
          </p>
          <h1 className="mt-4 font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-950 md:text-5xl lg:text-[3.25rem] dark:text-white">
            Your{" "}
            <span className="bg-gradient-to-r from-[#0072ce] via-[#4F46E5] to-[#7c3aed] bg-clip-text text-transparent">
              AI real estate team
            </span>
            <br className="hidden md:inline" /> that answers the phone
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-400">
            You're the boss — give one command to your Boss Assistant and it arranges the
            work: the receptionist answers, sales follows up, marketing fills the pipeline,
            and transactions and accounting handle the rest. You finally own a real team.
          </p>

          {/* Team chips */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {TEAM.map((m) => (
              <span
                key={m.name}
                className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
              >
                {m.name}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-[#0072ce]/20 transition hover:bg-[#005ba8] hover:shadow-xl"
            >
              Hire your AI team
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Hear it answer a call
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
                <Mic size={13} aria-hidden /> Real voice — both directions
              </p>
              <h2 className="mt-4 font-heading text-3xl font-bold leading-tight text-slate-900 md:text-4xl dark:text-white">
                It answers your calls — and{" "}
                <span className="bg-gradient-to-r from-[#0072ce] to-[#4F46E5] bg-clip-text text-transparent">
                  calls your sphere
                </span>
              </h2>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
                Every other CRM stops at SMS and email drips. RealtorBoss picks up the phone —
                answering inbound calls 24/7 <span className="font-semibold text-slate-800 dark:text-slate-200">and placing real outbound voice calls</span> to
                follow up with your sphere and leads. That conversation is what wins the listing.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={PRIMARY_CTA_HREF}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#005ba8]"
                >
                  Set up your receptionist
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {VOICE_POINTS.map((v) => (
                <div
                  key={v.title}
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
                        Only on RealtorBoss
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-heading text-sm font-bold text-slate-900 dark:text-white">
                    {v.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {v.body}
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
              You're the boss
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              Six AI teammates. One you.
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 md:text-lg">
              Tell the Boss Assistant what you want done — it arranges the work and puts the
              right teammate on it, around the clock. You finally own a real team, without the
              payroll, so you can do the part only you can: build relationships and close.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM.map((m) => (
              <div
                key={m.name}
                className={`relative h-full rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 ${
                  m.voice
                    ? "border-[#0072ce]/40 ring-1 ring-[#0072ce]/20 dark:border-[#0072ce]/40"
                    : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                {m.voice ? (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0072ce]">
                    <Mic size={11} aria-hidden /> Voice
                  </span>
                ) : null}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.accent}`}>
                  <m.icon size={22} aria-hidden />
                </div>
                <h3 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">
                  {m.name}
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-[#0072ce] dark:text-[#4da3e8]">
                  {m.role}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW THEY WORK TOGETHER ─── */}
      <section className="border-y border-slate-200/80 bg-slate-50/70 px-6 py-20 dark:border-slate-800 dark:bg-slate-900/30 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              One handoff to the next
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              From ring to closing — handled
            </h2>
          </div>
          <div className="mt-12 flex flex-wrap items-stretch justify-center gap-3">
            {DAY_FLOW.map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex w-36 flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
                    <step.icon size={20} aria-hidden />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 ? (
                  <ArrowRight size={18} className="shrink-0 text-slate-400" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOOLS the team brings ─── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
            And the deliverables clients see
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
            Reports that win listings and guide buyers
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {TOOLS.map((tool) => (
              <span
                key={tool.title}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <tool.icon size={16} className="text-[#0072ce]" aria-hidden />
                {tool.title}
              </span>
            ))}
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              + Comparison Report &amp; Net-to-Seller
            </span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─── */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] px-8 py-14 text-center text-white shadow-2xl md:px-12">
          <h2 className="font-heading text-3xl font-bold leading-tight md:text-4xl">
            Never miss a call — or a lead — again
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 md:text-lg">
            Put an AI team to work today. They answer, follow up, and coordinate. You close.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0072ce] shadow-lg transition hover:bg-slate-50 md:text-base"
              style={{ color: BRAND }}
            >
              Hire your AI team
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 md:text-base"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

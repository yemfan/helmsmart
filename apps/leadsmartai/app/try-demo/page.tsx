import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  MessageCircle,
  PenLine,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Try the live demo",
  description:
    "Click through a real CloseBoss workspace — 50 sample contacts, an AI-powered inbox, the drafts queue, calendar, and deal pipeline. No signup, no credit card.",
  alternates: { canonical: "/try-demo" },
  openGraph: {
    title: "Try the live CloseBoss demo",
    description:
      "A real read-only sandbox of the LeadSmart workspace — inbox, drafts, contacts, calendar. No signup required.",
    url: "/try-demo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Try the live CloseBoss demo",
    description:
      "Read-only sandbox of the workspace — inbox, drafts, contacts, calendar. No signup.",
  },
};

const SITE_URL = "https://closebossai.com";

type Tour = {
  label: string;
  href: string;
  body: string;
  icon: LucideIcon;
  highlight?: string;
};

const TOURS: Tour[] = [
  {
    label: "Overview",
    href: "/demo",
    body: "The day-at-a-glance dashboard — morning briefings, KPIs, response time, today's calendar, and active tasks.",
    icon: LayoutDashboard,
    highlight: "Start here",
  },
  {
    label: "Inbox",
    href: "/demo/inbox",
    body: "The AI follow-up showcase. See the exact sequence that turns a Zillow lead into a booked tour in 6 messages and 47 seconds of agent time.",
    icon: MessageCircle,
    highlight: "★ Killer feature",
  },
  {
    label: "AI Drafts",
    href: "/demo/drafts",
    body: "The review queue. Every AI draft shows its reasoning above the message, so you understand the AI's call before approving.",
    icon: PenLine,
  },
  {
    label: "Contacts",
    href: "/demo/contacts",
    body: "50 sample contacts with AI lead scoring (A/B/C), lifecycle stage, source attribution, and the AI's last-activity summary.",
    icon: Users,
  },
  {
    label: "Calendar",
    href: "/demo/calendar",
    body: "Upcoming tours, listing presentations, callbacks, and closings — linked to the deal pipeline below.",
    icon: LayoutDashboard,
  },
];

export default async function TryDemoPage() {
  const t = await getServerT();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Try the live CloseBoss demo",
    url: `${SITE_URL}/try-demo`,
    description:
      "Read-only sandbox of the LeadSmart workspace — inbox, drafts, contacts, calendar.",
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            Public sandbox
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            Click through a live LeadSmart workspace.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            No signup, no credit card. The demo is a real read-only
            workspace pre-loaded with 50 contacts, an active inbox, AI
            drafts in review, and a sample pipeline — so you can see
            exactly what your day looks like before you sign up.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Enter the demo
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Skip to free trial
            </Link>
          </div>
        </header>

        {/* Tour roadmap */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Where to look first
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Five surfaces, ~5 minutes of clicking. Start anywhere.
          </p>
          <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TOURS.map((tour) => (
              <li key={tour.href}>
                <Link
                  href={tour.href}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      <tour.icon className="h-4 w-4" aria-hidden />
                    </span>
                    {tour.highlight ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                        {tour.highlight}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
                    {tour.label}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {tour.body}
                  </p>
                  <span className="mt-auto pt-4 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Open tour →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* What's real, what's not */}
        <section className="mt-16 grid gap-5 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:grid-cols-2 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
              What&apos;s real
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">
              The product you&apos;ll use on day one
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {[
                "The UI, layout, and navigation — pixel-identical to what you'll see after signing up.",
                "The AI follow-up flow — same model, same drafting logic, same reasoning surface.",
                "The lead-scoring, lifecycle stages, and source attribution.",
                "The keyboard shortcuts and filter pills.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              What&apos;s sandboxed
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">
              Anything that would send a real message
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {[
                "The contacts and conversations are fictional. The phone numbers are in the 555-reserved range.",
                "Send / Approve / Reply / Add deal buttons are disabled — they show a Demo tag.",
                "Calendar events, drafts, and deals don't change between visits — same snapshot for everyone.",
                "AI is illustrating its capability, not actually thinking on your behalf here.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Sparkles
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA footer */}
        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center md:p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">
            Ready to use it for real?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            14-day free trial. CSV import or concierge migration if
            you&apos;re leaving another CRM. No credit card.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start free trial
            </Link>
            <Link
              href="/switch-from"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Migrate from another CRM
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

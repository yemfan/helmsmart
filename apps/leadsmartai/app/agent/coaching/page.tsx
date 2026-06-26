import type { Metadata } from "next";
import Link from "next/link";
import {
  COACHING_PROGRAMS,
  PROGRAM_ORDER,
  type CoachingProgram,
} from "@/lib/coaching-programs/programs";

export const metadata: Metadata = {
  title: "RealtyBoss Coaching — Producer Track + Top Producer Track",
  description:
    "AI-driven coaching built into RealtyBoss. Producer Track (Pro+) targets 3% conversion / 10 transactions; Top Producer Track (Premium + Team) targets 5% conversion / 15 transactions. No add-on, no upsell — included in the plan price.",
  keywords: [
    "real estate coaching",
    "real estate AI coaching",
    "producer track",
    "top producer track",
    "real estate agent training",
    "leadsmart coaching",
  ],
  alternates: { canonical: "/agent/coaching" },
  openGraph: {
    title: "RealtyBoss Coaching — Producer Track + Top Producer Track",
    description:
      "AI-driven coaching built into RealtyBoss. Producer Track (10 deals / 3% conv) and Top Producer Track (15 deals / 5% conv) — included in your plan, no add-on fee.",
    url: "/agent/coaching",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RealtyBoss Coaching",
    description:
      "Producer Track + Top Producer Track — AI coaching built into RealtyBoss for real estate agents.",
  },
};

/**
 * Canonical FAQ list — single source of truth for both the
 * `<FAQ />` component below and the FAQPage JSON-LD emitted by
 * the page so the schema and the rendered text never drift apart.
 */
const COACHING_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Is this a separate paid program?",
    a: "No. Coaching is built into the plan price. Producer Track is included with Pro and above; Top Producer Track is included with Premium and Team. No upsell, no add-on fee.",
  },
  {
    q: "What's the difference between Producer Track and Top Producer Track?",
    a: "Producer Track gives you the daily plan, weekly playbooks, monthly review, and basic peer benchmarks — targeting 10 transactions and 3% conversion. Top Producer Track adds custom playbooks generated from YOUR live deals, monthly AI deep-dives, top-10% peer benchmarks, and priority access to new AI features — targeting 15 transactions and 5% conversion.",
  },
  {
    q: "Will I be auto-enrolled?",
    a: "Yes — when you upgrade to a plan that includes a program, you're auto-enrolled the next time you sign in. You can opt out in settings; we won't re-enroll you automatically after that.",
  },
  {
    q: "What about agents on the Starter plan?",
    a: "Starter doesn't include coaching. Upgrade to Pro to start Producer Track, or Premium for Top Producer Track.",
  },
  {
    q: "How do you measure the conversion-rate target?",
    a: "Lead-to-close — the percentage of contacts created in RealtyBoss (any source) that result in a closed transaction. Visible on your performance dashboard with a moving 12-month window.",
  },
];

/**
 * Public marketing landing for RealtyBoss Coaching. Reads the
 * canonical program registry from `lib/coaching-programs/programs.ts`
 * so targets + bullets stay in sync with the code that enforces
 * enrollment.
 *
 * Public surface: gated only by the proxy.ts + agent layout
 * allowlist additions for /agent/coaching. No auth needed.
 */
export default function AgentCoachingPage() {
  const programs = PROGRAM_ORDER.map((slug) => COACHING_PROGRAMS[slug]);
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: COACHING_FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            RealtyBoss Coaching
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            Coaching that&apos;s built in,
            <br className="hidden md:block" /> not bolted on.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            Most CRMs add &ldquo;AI&rdquo; as a feature label. We built our
            product around an AI coaching layer — daily action plans, weekly
            playbooks, peer benchmarks, and AI deep-dives that move the
            numbers that matter. Two programs cover everyone from new agents
            to top producers.
          </p>
        </header>

        <Pillars />

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          {programs.map((p) => (
            <ProgramCard key={p.slug} program={p} />
          ))}
        </section>

        <Methodology />

        <FAQ />

        <section className="mt-16 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            Coaching is in every paid plan
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
            Producer Track auto-enrolls on Pro and above. Top Producer Track
            is bundled with Premium and Team. No coaching add-on fee, ever.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/agent/pricing"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              See pricing
            </Link>
            <Link
              href="/agent/compare"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
            >
              How we compare
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── pillars (above the program cards) ──────────────────────────

function Pillars() {
  const pillars: Array<{ title: string; body: string }> = [
    {
      title: "AI-driven daily plans",
      body: "Every morning the dashboard shows the next 5 actions tailored to your sales model, deal stage, and live signals — not a static checklist.",
    },
    {
      title: "Weekly playbook drops",
      body: "AI-generated playbooks adapt to what's actually happening in your pipeline. Stuck on inspection objections? Next week's drill is built around that.",
    },
    {
      title: "Peer benchmarks",
      body: "Your response time, conversion, and pipeline health stack-ranked against the platform-wide top quartile and your own moving average.",
    },
    {
      title: "AI deep-dives (Top Producer Track)",
      body: "Monthly: lead-source ROI heatmap, drop-off analysis, deal-coach reviews of your last 10 closings. Identifies patterns no human will spot.",
    },
  ];
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {pillars.map((p) => (
        <div
          key={p.title}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">{p.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">{p.body}</p>
        </div>
      ))}
    </div>
  );
}

// ── per-program card ───────────────────────────────────────────

function ProgramCard({ program }: { program: CoachingProgram }) {
  const isTop = program.slug === "top_producer_track";
  return (
    <div
      className={[
        "rounded-2xl border p-6 shadow-sm",
        isTop
          ? "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white"
          : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">{program.name}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {program.tagline}
          </p>
        </div>
        {isTop ? (
          <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            Premium + Team
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Pro+
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat
          label="Annual transactions"
          value={String(program.annualTransactionTarget)}
          tone={isTop ? "primary" : "default"}
        />
        <Stat
          label="Lead-to-close target"
          value={`${program.conversionRateTargetPct}%`}
          tone={isTop ? "primary" : "default"}
        />
      </div>

      <ul className="mt-5 space-y-2">
        {program.bullets.map((b) => (
          <li
            key={b}
            className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"
          >
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "default";
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-2xl font-semibold tabular-nums ${
          tone === "primary" ? "text-blue-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ── methodology section ────────────────────────────────────────

function Methodology() {
  return (
    <section className="mt-16 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Methodology
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
        How the program runs every week
      </h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Monday</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Weekly playbook drops based on your live pipeline + recent
            metrics. 5 priority actions for the week.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Daily</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Today&apos;s Action Plan tied to your sales model. Done /
            skipped tracked. Real-time peer benchmarks.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Friday</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Self-review summary: what closed, what stalled, what to drill
            next. AI surfaces patterns from the week&apos;s data.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────

function FAQ() {
  const faqs = COACHING_FAQ;
  return (
    <section className="mt-16">
      <h2 className="text-center text-xl font-semibold text-slate-900 md:text-2xl">
        Common questions
      </h2>
      <div className="mt-6 space-y-3">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
              {f.q}
              <span className="text-slate-400 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

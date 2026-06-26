import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Flag,
  GitBranch,
  Headphones,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "RealtorBoss for Real Estate Brokerages — operate your brokerage, not just track agents",
  description:
    "The brokerage operating system that makes every agent your top producer. Broker-first dashboard, agent-fitness flags, AI nurture, and per-agent pricing that undercuts kvCORE by 40-60%.",
  keywords: [
    "real estate brokerage software",
    "brokerage CRM",
    "real estate broker dashboard",
    "agent performance tracking",
    "agent retention",
    "brokerage operating system",
    "kvCORE alternative",
    "Follow Up Boss alternative",
    "Chime alternative",
  ],
};

const KPI_BAR = [
  { value: "< 5 min", label: "Speed-to-lead", hint: "Brokerage-wide median, automated" },
  { value: "+50%", label: "Lead → appt conversion", hint: "AI nurture + persistent follow-up" },
  { value: "−15pp", label: "Under-producer ratio", hint: "Agents writing < 6 sides / yr" },
  { value: "+10pp", label: "12-month retention", hint: "Top agents stay for the tools" },
];

const BROKER_FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Brokerage-wide command center",
    body: "Every agent's pipeline in one view. Total pipeline, this-month closes, speed-to-lead median, retention rate — at a glance.",
  },
  {
    icon: Trophy,
    title: "Real-time agent leaderboard",
    body: "Speed-to-lead, response rate, appts-set, closes — by agent, ranked. Visible to all agents. Top producers compete; underperformers can't hide.",
  },
  {
    icon: Flag,
    title: "Agent-fitness flags",
    body: "Automatic alerts when response time slips, a hot lead goes cold for 24h+, or an agent's pipeline shrinks week-over-week. Catch retention risk before they leave.",
  },
  {
    icon: GitBranch,
    title: "Lead-distribution rules you control",
    body: "Round-robin, geo, top-producer-priority, or opt-in. Set policy once; system enforces. Agents can't cherry-pick or sandbag.",
  },
  {
    icon: Network,
    title: "Recruiting + onboarding pipeline",
    body: "Track every recruit from coffee meeting → license filed → onboarded → first sale. New-agent checklist (license verified, MLS linked, templates approved) keeps your managing broker on top of it.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance posture, brokerage-wide",
    body: "TCPA opt-in audit per lead. Supervised review queue for AI-drafted outbound. Searchable archive of every message. When an FCC complaint lands, evidence in 30 seconds.",
  },
];

const AGENT_FEATURES = [
  {
    icon: Bot,
    title: "AI nurture in under 5 minutes",
    body: "Every inbound lead gets an SMS or email reply in the agent's voice, with TCPA-compliant disclosures auto-appended.",
  },
  {
    icon: Sparkles,
    title: "AI CMA in 60 seconds",
    body: "Agent enters an address, gets an agent-branded comparative market analysis ready to send to a homeowner. The agent-adoption wedge.",
  },
  {
    icon: TrendingUp,
    title: "Agent-branded home-value funnel",
    body: "Every agent gets a personal URL — they share on social, postcards, email signature. Leads land directly in their pipeline, attributed to them, visible to the broker.",
  },
  {
    icon: CalendarClock,
    title: "Calendar booking + sit reminders",
    body: "Prospects book directly into the agent's calendar. T-24h and T-2h reminders fire automatically. Show-rate climbs.",
  },
];

const COMPARISON_ROWS = [
  { stack: "kvCORE", limit: "Built agent-first; broker dashboard is a reporting afterthought. AI is template substitution. $4,500–6,000/mo for 100 agents." },
  { stack: "Follow Up Boss", limit: "Cleanest agent UX. Zero broker tools. Broker analytics costs $300/agent in 'FUB Custom'. $6,900/mo for 100 agents." },
  { stack: "Chime", limit: "Closest to us on intent. 5-year-old UX. AI is template-based, not LLM-generative." },
  { stack: "BoomTown", limit: "Excellent CS team. $1,500–3,500+/mo before agent seats. Pricing makes sense for $5M+ brokerages, not 100-agent independents." },
  { stack: "Spreadsheets + WhatsApp", limit: "Fast for small teams. Zero broker visibility. WhatsApp isn't TCPA-compliant for prospecting." },
  { stack: "RealtorBoss", limit: "✓ Broker-first home screen, real LLM AI, agent-fitness flags, $24/agent at 100 — half the category cost." },
];

const HOW_IT_WORKS = [
  { num: "01", title: "Capture", body: "Every agent gets a personal home-value funnel + the lead programs you're already paying for (Zillow, Realtor.com) plug in." },
  { num: "02", title: "Nurture", body: "AI SMS/email replies within 5 minutes, in the agent's voice, with TCPA-compliant disclosures. 80% of follow-up the agent was skipping, handled." },
  { num: "03", title: "Convert", body: "Calendar booking + auto-reminders. CMAs generated in 60 sec so the agent shows up to the appointment ready to present." },
  { num: "04", title: "Retain + grow", body: "Broker sees fitness flags before agents quit. Recruiting pipeline + onboarding checklist for the producers you're trying to poach." },
];

const FAQ = [
  {
    q: "How is this different from kvCORE or Follow Up Boss?",
    a: "kvCORE was built agent-first, with broker reporting bolted on. FUB has the cleanest agent UX in the category and explicitly doesn't try to serve brokerages — broker analytics costs $300/agent on top in their Custom tier. We built the broker dashboard as the home screen and shipped real AI (not template substitution) at $24/agent at 100 — roughly half the cost.",
  },
  {
    q: "Will my agents actually adopt it?",
    a: "Adoption is the real game. Two structural answers: the AI does 80% of the follow-up the agent was never going to do anyway, so the friction is closer to 'check email' than 'learn Salesforce.' And the home-value funnel + CMA generator are tools agents will use because they want to look professional — adoption follows utility, not policy.",
  },
  {
    q: "What about migration from our current CRM?",
    a: "Standard CSV import for contacts, leads, pipeline stages. Workflow mapping during onboarding. Plan for 4–6 weeks of parallel-running both systems, then deprecate the old one. We've done this.",
  },
  {
    q: "Has any brokerage with 100+ agents used this?",
    a: "Honestly, you'd be among our first three large-brokerage deployments. 3,400+ producers run on the platform today, but most are individual agents or small teams. The tradeoff: in exchange for being a first-mover, you get the product shaped around your workflow, direct founder access during deployment, and a case study at month 12 that becomes your moat against the brokerages who come after.",
  },
  {
    q: "What's the catch on the pricing?",
    a: "No catch. We're newer at the brokerage tier and pricing accordingly to win deployments. Pricing locks for year one with a 10% cap on any renewal increase. We can afford this because we don't have a sales-led GTM yet.",
  },
];

const PRICING = [
  {
    tier: "30–99 agents",
    perAgent: "$29",
    note: "Pilot tier",
    description: "Smaller independent brokerages testing the platform with their full roster.",
  },
  {
    tier: "100–299 agents",
    perAgent: "$24",
    note: "Most popular",
    description: "Mid-size independents — the sweet spot for brokerage operating-system value.",
    featured: true,
  },
  {
    tier: "300+ agents",
    perAgent: "$19",
    note: "Volume tier",
    description: "Multi-office or large independents. Custom terms available.",
  },
];

export default function ForBrokeragesPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <Building2 className="h-5 w-5 text-slate-700" />
            RealtorBoss <span className="text-slate-400">·</span>{" "}
            <span className="text-slate-600">for brokerages</span>
          </Link>
          <nav className="hidden gap-6 text-sm text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#compare" className="hover:text-slate-900">Why us</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </nav>
          <a
            href="#book"
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Book a working session
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                <Building2 className="h-3.5 w-3.5" />
                Built for independent brokerages, 30–200 agents
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
                The <span className="text-amber-300">operating system</span> for running your brokerage —
                not another CRM your agents have to learn.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-7 text-white/80">
                Brokerages compete on two numbers: average GCI per agent and 12-month retention.
                Both stall when your tech treats the broker as a passive bystander. We built this
                with the brokerage owner as the primary user.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#book"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 hover:bg-amber-300"
                >
                  Book a 45-min working session <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
                >
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-xs text-white/60">
                No deck. No pressure. We rebuild the ROI model on your actual numbers.
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Brokerage performance benchmarks
                </p>
                <div className="mt-3 space-y-4">
                  {KPI_BAR.map((kpi) => (
                    <div key={kpi.label} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-white/80">{kpi.label}</span>
                        <span className="text-2xl font-semibold text-amber-300">{kpi.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/60">{kpi.hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Capture → nurture → convert → retain
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            One platform for the entire lead-to-listing cycle. Plus the recruiting layer that
            keeps your roster growing.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.num} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-xs font-semibold text-amber-600">{step.num}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Broker first */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              What the broker gets
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              The brokerage command center
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Most real estate CRMs treat the broker as someone who reads reports. We treat the
              broker as the primary user. The home screen is yours.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {BROKER_FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm">
                <f.icon className="h-6 w-6 text-amber-600" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Agent (the mechanism) */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              What every agent gets — the mechanism
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Tools your agents actually want to use
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Adoption follows utility, not policy. The home-value funnel and CMA generator
              are the wedge — agents pick them up because they want to look professional, not
              because the broker told them to.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {AGENT_FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <f.icon className="h-6 w-6 text-blue-700" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            What brokerages use today vs. what actually moves the metrics
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Honest read on the category. Every other tool was built for someone other than the
            brokerage owner.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-5 py-3">Current stack</th>
                  <th className="px-5 py-3">Where it falls short</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={i} className={i === COMPARISON_ROWS.length - 1 ? "bg-amber-50/50" : ""}>
                    <td className="px-5 py-4 font-semibold text-slate-900">{row.stack}</td>
                    <td className="px-5 py-4 text-slate-700">{row.limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Per-agent pricing, billed annually
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
              All tiers include the full platform — broker dashboard, agent CRM, AI nurture,
              CMA generator, home-value funnel, compliance archive. Pricing locks for year one
              with a 10% cap on any renewal increase.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PRICING.map((p) => (
              <article
                key={p.tier}
                className={[
                  "flex flex-col rounded-2xl border bg-white p-6",
                  p.featured ? "border-amber-400 shadow-lg ring-1 ring-amber-400" : "border-slate-200",
                ].join(" ")}
              >
                <header>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{p.tier}</h3>
                    <span
                      className={[
                        "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        p.featured ? "bg-amber-400 text-slate-900" : "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {p.note}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <p className="text-4xl font-semibold tracking-tight text-slate-900">{p.perAgent}</p>
                    <p className="text-sm text-slate-500">/ agent / mo</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{p.description}</p>
                </header>
                <a
                  href="#book"
                  className={[
                    "mt-6 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
                    p.featured
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Book working session
                </a>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-slate-500">
            A 100-agent brokerage at $24/agent is $2,880/mo — roughly half the cost of kvCORE or
            Follow Up Boss at the same scale. Existing CRM you replace usually covers the line item.
          </p>
        </div>
      </section>

      {/* Honesty section */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Honest read
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                What we&apos;re newer at
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                We have 3,400+ producers on the platform today, but most are at the individual-agent
                or small-team tier. You&apos;d be among our first three large-brokerage deployments.
              </p>
              <p className="mt-3 text-base leading-7 text-slate-600">
                That&apos;s a tradeoff worth naming. In exchange, the rollout gets shaped around your
                workflow, you have direct founder access during deployment, and the case study at
                month 12 becomes a moat against the brokerages who come after.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                What&apos;s de-risked vs. what&apos;s new
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">De-risked:</strong> the platform itself —
                    3,400 producers in production, 99.9% uptime, millions of AI messages sent,
                    carrier-audited compliance posture.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">Newer at scale:</strong> the broker
                    dashboard with 100+ agents, lead-routing rules at scale, brokerage-wide
                    leaderboard at 100+ producers.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">Mitigated by:</strong> 30-day onboarding
                    checkpoint, direct founder Slack channel, weekly check-ins for the first 90
                    days, contract restructuring option if cohort retention falls below 50% at
                    day 30.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Common questions from brokerage owners
          </h2>
          <div className="mt-10 space-y-5">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6">
                <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="book" className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6 md:py-20">
          <Headphones className="mx-auto h-10 w-10 text-amber-400" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Book a 45-minute working session
          </h2>
          <p className="mt-4 text-base leading-7 text-white/80">
            You, your managing broker, and one or two of your top producers. We walk through the
            broker dashboard with your numbers — actual or sample at your scale. Producers
            stress-test the workflows. We close with concrete ROI math against your lead spend
            and agent count.
          </p>
          <p className="mt-3 text-sm leading-7 text-white/60">
            No deck. No slideware. No pressure.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact?topic=brokerage-working-session"
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 hover:bg-amber-300"
            >
              Schedule the session <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:contact@helmsmart.ai?subject=Brokerage%20working%20session"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
            >
              Email instead
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 py-8 text-center text-xs text-white/60">
        © RealtorBoss · The brokerage operating system. Pilot inquiries welcome.
      </footer>

      <KeepIconsBundled />
    </main>
  );
}

/* Touch unused icons so tree-shaking keeps them available for swaps. */
function KeepIconsBundled() {
  void [BarChart3, Briefcase, Timer, Users];
  return null;
}

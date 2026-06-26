import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Home,
  Sparkles,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Free real estate tools — calculators, analyzers, and AI",
  description:
    "Every free tool from RealtyBoss in one place — mortgage and ROI calculators, cap rate and cash flow analysis, AI deal analyzers, Smart CMA builder, home value estimator. No signup required.",
  keywords: [
    "free real estate calculator",
    "mortgage calculator",
    "cap rate calculator",
    "AI CMA",
    "investment property analyzer",
    "rent vs buy calculator",
    "home value estimator",
  ],
  alternates: { canonical: "/free-tools" },
  openGraph: {
    title: "Free real estate tools — RealtyBoss",
    description:
      "Calculators, analyzers, and AI tools real estate agents and investors actually use. Free, no signup required.",
    url: "/free-tools",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free real estate tools — RealtyBoss",
    description:
      "Calculators, AI analyzers, CMA builder, and home value estimator — free, no signup.",
  },
};

type Tool = {
  name: string;
  href: string;
  description: string;
  /** Mark hero tools so the index highlights them. */
  featured?: boolean;
};

type Section = {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  tools: Tool[];
};

const SECTIONS: Section[] = [
  {
    id: "ai-tools",
    title: "AI-powered analyzers",
    blurb:
      "Drop in an address or a Zillow link — get a full deal memo, comp set, or CMA in under a minute. The same engine that powers RealtyBoss follow-up.",
    icon: Bot,
    tools: [
      {
        name: "AI Real Estate Deal Analyzer",
        href: "/ai-real-estate-deal-analyzer",
        description:
          "Paste any property URL or address — get a one-page AI deal memo covering condition, risks, comps, and target price. ~30 seconds.",
        featured: true,
      },
      {
        name: "AI Zillow / Redfin Link Analyzer",
        href: "/ai-zillow-redfin-link-analyzer",
        description:
          "Drop a Zillow or Redfin URL. The AI pulls listing details, condition signals from photos, comp benchmarks, and a price defensibility take.",
      },
      {
        name: "AI CMA Analyzer",
        href: "/ai-cma-analyzer",
        description:
          "Auto-pull comparable sales and produce a CMA-style price range with full reasoning, ready to share with a seller.",
      },
      {
        name: "Smart CMA Builder",
        href: "/smart-cma-builder",
        description:
          "Interactive CMA — adjust comp weights, recommend a price range, and export a branded PDF. Under 5 minutes per CMA.",
      },
      {
        name: "Property Investment Analyzer",
        href: "/property-investment-analyzer",
        description:
          "Cap rate, cash-on-cash, NOI, and 5-year IRR on any rental in under 3 minutes. Saved scenarios stay on the deal.",
      },
      {
        name: "Rental Property Analyzer",
        href: "/rental-property-analyzer",
        description:
          "Side-by-side rental analysis with rent estimates, expense defaults pre-filled from local averages, and stress-test scenarios.",
      },
      {
        name: "Property Report Generator",
        href: "/property-report",
        description:
          "Drop an address — get a 6-page branded PDF report covering market context, comps, valuation, and neighborhood data.",
      },
    ],
  },
  {
    id: "buyer-tools",
    title: "Calculators for buyers",
    blurb:
      "Send a buyer a custom, branded calculator they can play with — see what their monthly payment, affordability, or rent-vs-buy story actually looks like.",
    icon: Home,
    tools: [
      {
        name: "Mortgage Calculator",
        href: "/mortgage-calculator",
        description:
          "Principal, interest, taxes, and insurance with adjustable down payment and rate. Branded share link for any client.",
        featured: true,
      },
      {
        name: "Affordability Calculator",
        href: "/affordability-calculator",
        description:
          "Income-based price range with debt-to-income gating. Show buyers what they can actually qualify for.",
      },
      {
        name: "Down Payment Calculator",
        href: "/down-payment-calculator",
        description:
          "How much you need at closing — down payment + closing costs + reserves — at any price point.",
      },
      {
        name: "Rent vs Buy Calculator",
        href: "/rent-vs-buy-calculator",
        description:
          "Break-even analysis with appreciation, tax benefits, and opportunity cost. Drops the renting-forever myth in 30 seconds.",
      },
      {
        name: "Closing Cost Estimator",
        href: "/closing-cost-estimator",
        description:
          "Itemized closing costs by state — title, transfer tax, escrow, prepaids. Surfaces surprises before they happen.",
      },
      {
        name: "Refinance Calculator",
        href: "/refinance-calculator",
        description:
          "Break-even on a refinance with closing costs included. Pairs well with rate-shopping outreach to past clients.",
      },
      {
        name: "ARM Calculator",
        href: "/adjustable-rate-calculator",
        description:
          "Model 5/1, 7/1, and 10/1 ARMs against a fixed 30-year. Worst-case payment included so the conversation is grounded.",
      },
    ],
  },
  {
    id: "investor-tools",
    title: "Calculators for investors",
    blurb:
      "The income-property math that decides whether to make the offer. Cap rate, cash flow, ROI — all editable, all shareable.",
    icon: TrendingUp,
    tools: [
      {
        name: "Cap Rate & ROI Calculator",
        href: "/cap-rate-calculator",
        description:
          "NOI, cap rate, and ROI for any rental in under a minute. Pair with the Investment Analyzer for the full DCF model.",
        featured: true,
      },
      {
        name: "Cash Flow Calculator",
        href: "/cash-flow-calculator",
        description:
          "Monthly and annual cash flow with vacancy, maintenance, management, and reserves. Stress-test before you offer.",
      },
      {
        name: "ROI Calculator",
        href: "/roi-calculator",
        description:
          "Total return on invested capital including financing leverage. Compare scenarios side by side.",
      },
    ],
  },
  {
    id: "seller-tools",
    title: "Tools for sellers",
    blurb:
      "Capture seller leads with an instant home value estimate, then turn the address into a CMA and a listing presentation.",
    icon: Sprout,
    tools: [
      {
        name: "Home Value Estimator",
        href: "/home-value-estimator",
        description:
          "AI-backed home value range for any U.S. address. Embed the widget on your IDX site to capture seller leads.",
        featured: true,
      },
      {
        name: "Cap Rate by City",
        href: "/cap-rate-by-city-in-the-united-states",
        description:
          "Typical cap rate ranges for major U.S. markets — useful when pricing income properties against local comps.",
      },
    ],
  },
];

const SITE_URL = "https://realtybossai.com";

export default function FreeToolsPage() {
  const total = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Free Real Estate Tools — RealtyBoss",
    url: `${SITE_URL}/free-tools`,
    description:
      "Free calculators, AI analyzers, and CMA tools for real estate agents and investors. No signup required.",
    hasPart: SECTIONS.flatMap((s) =>
      s.tools.map((t) => ({
        "@type": "SoftwareApplication",
        name: t.name,
        applicationCategory: s.title,
        url: `${SITE_URL}${t.href}`,
        description: t.description,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      })),
    ),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            Free tools
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            {total} free tools real estate agents actually use.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            Calculators, AI analyzers, CMA builders, and home value
            estimators — the same surfaces our paying customers run on
            paid plans, free and without a signup.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Built for solo agents, brokers, investors, and serious
            buyers. Most tools work in under 60 seconds.
          </p>
        </header>

        <nav aria-label="Tool categories" className="mt-10">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-900/50 dark:hover:bg-slate-900/60"
                >
                  {s.title}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({s.tools.length})
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-14">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <section.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
                    {section.title}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {section.blurb}
                  </p>
                </div>
              </div>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.tools.map((tool) => (
                  <li key={tool.href}>
                    <ToolCard tool={tool} sectionIcon={section.icon} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950">
          <div className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                Want them inside one CRM?
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white">
                Every tool above + AI follow-up, voice AI, and missed-call recovery.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base dark:text-slate-300">
                RealtyBoss is what these tools sit inside — your AI
                sales team, on your phone, 24/7. $49/mo starting, free
                14-day trial, no credit card.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/start-free"
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Start 14-day trial
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
                >
                  See all features
                </Link>
              </div>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">⚡</span>
                <span>AI follow-up in under 60 seconds, 24/7</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">📞</span>
                <span>Missed-call text-back on every plan</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">🎙️</span>
                <span>Voice AI that answers your phone when you can&apos;t</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">💸</span>
                <span>Starts at $49/mo — solo-agent pricing</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolCard({
  tool,
  sectionIcon: Icon,
}: {
  tool: Tool;
  sectionIcon: LucideIcon;
}) {
  return (
    <Link
      href={tool.href}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {tool.featured ? (
          <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
            <Sparkles className="mr-1 h-3 w-3" aria-hidden />
            Popular
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
        {tool.name}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {tool.description}
      </p>
      <span className="mt-auto pt-4 text-xs font-semibold text-blue-700 dark:text-blue-300">
        Open tool →
      </span>
    </Link>
  );
}

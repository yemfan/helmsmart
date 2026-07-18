import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Download,
  Home,
  Sparkles,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

type TFn = (key: string, opts?: { ns?: string; [k: string]: unknown }) => string;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tf = (key: string): string => t(key, { ns: "web_free_tools" });
  return {
    title: tf("meta.title"),
    description: tf("meta.description"),
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
      title: tf("meta.og_title"),
      description: tf("meta.og_description"),
      url: "/free-tools",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: tf("meta.twitter_title"),
      description: tf("meta.twitter_description"),
    },
  };
}

type Tool = {
  /** i18n key under `sections.<sectionId>.tools.<toolKey>`. */
  key: string;
  /** Canonical English name — used for JSON-LD (SEO stability). */
  name: string;
  href: string;
  /** Canonical English description — used for JSON-LD. */
  description: string;
  /** Mark hero tools so the index highlights them. */
  featured?: boolean;
};

type Section = {
  id: string;
  /** Canonical English title — used for JSON-LD applicationCategory. */
  title: string;
  icon: LucideIcon;
  tools: Tool[];
};

const SECTIONS: Section[] = [
  {
    id: "ai-tools",
    title: "AI-powered analyzers",
    icon: Bot,
    tools: [
      {
        key: "deal-analyzer",
        name: "AI Real Estate Deal Analyzer",
        href: "/ai-real-estate-deal-analyzer",
        description:
          "Paste any property URL or address — get a one-page AI deal memo covering condition, risks, comps, and target price. ~30 seconds.",
        featured: true,
      },
      {
        key: "link-analyzer",
        name: "AI Zillow / Redfin Link Analyzer",
        href: "/ai-zillow-redfin-link-analyzer",
        description:
          "Drop a Zillow or Redfin URL. The AI pulls listing details, condition signals from photos, comp benchmarks, and a price defensibility take.",
      },
      {
        key: "cma-analyzer",
        name: "AI CMA Analyzer",
        href: "/ai-cma-analyzer",
        description:
          "Auto-pull comparable sales and produce a CMA-style price range with full reasoning, ready to share with a seller.",
      },
      {
        key: "smart-cma",
        name: "Smart CMA Builder",
        href: "/smart-cma-builder",
        description:
          "Interactive CMA — adjust comp weights, recommend a price range, and export a branded PDF. Under 5 minutes per CMA.",
      },
      {
        key: "investment-analyzer",
        name: "Property Investment Analyzer",
        href: "/property-investment-analyzer",
        description:
          "Cap rate, cash-on-cash, NOI, and 5-year IRR on any rental in under 3 minutes. Saved scenarios stay on the deal.",
      },
      {
        key: "rental-analyzer",
        name: "Rental Property Analyzer",
        href: "/rental-property-analyzer",
        description:
          "Side-by-side rental analysis with rent estimates, expense defaults pre-filled from local averages, and stress-test scenarios.",
      },
      {
        key: "report-generator",
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
    icon: Home,
    tools: [
      {
        key: "mortgage",
        name: "Mortgage Calculator",
        href: "/mortgage-calculator",
        description:
          "Principal, interest, taxes, and insurance with adjustable down payment and rate. Branded share link for any client.",
        featured: true,
      },
      {
        key: "affordability",
        name: "Affordability Calculator",
        href: "/affordability-calculator",
        description:
          "Income-based price range with debt-to-income gating. Show buyers what they can actually qualify for.",
      },
      {
        key: "down-payment",
        name: "Down Payment Calculator",
        href: "/down-payment-calculator",
        description:
          "How much you need at closing — down payment + closing costs + reserves — at any price point.",
      },
      {
        key: "rent-vs-buy",
        name: "Rent vs Buy Calculator",
        href: "/rent-vs-buy-calculator",
        description:
          "Break-even analysis with appreciation, tax benefits, and opportunity cost. Drops the renting-forever myth in 30 seconds.",
      },
      {
        key: "closing-cost",
        name: "Closing Cost Estimator",
        href: "/closing-cost-estimator",
        description:
          "Itemized closing costs by state — title, transfer tax, escrow, prepaids. Surfaces surprises before they happen.",
      },
      {
        key: "refinance",
        name: "Refinance Calculator",
        href: "/refinance-calculator",
        description:
          "Break-even on a refinance with closing costs included. Pairs well with rate-shopping outreach to past clients.",
      },
      {
        key: "arm",
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
    icon: TrendingUp,
    tools: [
      {
        key: "cap-rate",
        name: "Cap Rate & ROI Calculator",
        href: "/cap-rate-calculator",
        description:
          "NOI, cap rate, and ROI for any rental in under a minute. Pair with the Investment Analyzer for the full DCF model.",
        featured: true,
      },
      {
        key: "cash-flow",
        name: "Cash Flow Calculator",
        href: "/cash-flow-calculator",
        description:
          "Monthly and annual cash flow with vacancy, maintenance, management, and reserves. Stress-test before you offer.",
      },
      {
        key: "roi",
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
    icon: Sprout,
    tools: [
      {
        key: "home-value",
        name: "Home Value Estimator",
        href: "/home-value-estimator",
        description:
          "AI-backed home value range for any U.S. address. Embed the widget on your IDX site to capture seller leads.",
        featured: true,
      },
      {
        key: "cap-rate-by-city",
        name: "Cap Rate by City",
        href: "/cap-rate-by-city-in-the-united-states",
        description:
          "Typical cap rate ranges for major U.S. markets — useful when pricing income properties against local comps.",
      },
    ],
  },
  {
    id: "guides-downloads",
    title: "Guides & downloads",
    blurb:
      "Free, no-signup resources you can put to work today — starting with our full AI skills library for agents.",
    icon: Download,
    tools: [
      {
        name: "Realtor AI Skills Library (59 prompts)",
        href: "/skills-library",
        description:
          "59 compliance-baked AI prompts across lead gen, listings, buyer rep, negotiation, and ops — each with the value it captures. Browse or download free, no signup.",
        featured: true,
      },
    ],
  },
];

const SITE_URL = "https://realtybossai.com";

export default async function FreeToolsPage() {
  const t = await getServerT();
  const tf: TFn = (key, opts) => t(key, { ns: "web_free_tools", ...opts });
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
            {tf("header.eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            {tf("header.title", { total })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            {tf("header.subtitle")}
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {tf("header.note")}
          </p>
        </header>

        <nav aria-label={tf("nav_aria")} className="mt-10">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-900/50 dark:hover:bg-slate-900/60"
                >
                  {tf(`sections.${s.id}.title`)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({s.tools.length})
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section
          aria-labelledby="lead-magnet-title"
          className="mt-10 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950"
        >
          <div className="grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                {tf("lead_magnet.eyebrow")}
              </p>
              <h2
                id="lead-magnet-title"
                className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white"
              >
                {tf("lead_magnet.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base dark:text-slate-300">
                {tf("lead_magnet.body")}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="/downloads/RealtyBoss_5_AI_Prompts.pdf"
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {tf("lead_magnet.download_en")}
                </a>
                <a
                  href="/downloads/RealtyBoss_5_AI_Prompts_ZH.pdf"
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {tf("lead_magnet.download_zh")}
                </a>
              </div>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">✍️</span>
                <span>
                  <strong className="font-semibold">{tf("lead_magnet.items.0.bold")}</strong>{" "}
                  {tf("lead_magnet.items.0.rest")}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">📲</span>
                <span>
                  <strong className="font-semibold">{tf("lead_magnet.items.1.bold")}</strong>{" "}
                  {tf("lead_magnet.items.1.rest")}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">📊</span>
                <span>
                  <strong className="font-semibold">{tf("lead_magnet.items.2.bold")}</strong>{" "}
                  {tf("lead_magnet.items.2.rest")}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">🎯</span>
                <span>
                  <strong className="font-semibold">{tf("lead_magnet.items.3.bold")}</strong>{" "}
                  {tf("lead_magnet.items.3.rest")}
                </span>
              </li>
            </ul>
          </div>
        </section>

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
                    {tf(`sections.${section.id}.title`)}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {tf(`sections.${section.id}.blurb`)}
                  </p>
                </div>
              </div>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.tools.map((tool) => (
                  <li key={tool.href}>
                    <ToolCard tool={tool} sectionId={section.id} sectionIcon={section.icon} tf={tf} />
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
                {tf("cross_sell.eyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white">
                {tf("cross_sell.heading")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base dark:text-slate-300">
                {tf("cross_sell.body")}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/start-free"
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  {tf("cross_sell.start_trial")}
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
                >
                  {tf("cross_sell.see_features")}
                </Link>
              </div>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">⚡</span>
                <span>{tf("cross_sell.items.0")}</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">📞</span>
                <span>{tf("cross_sell.items.1")}</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">🎙️</span>
                <span>{tf("cross_sell.items.2")}</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-base">💸</span>
                <span>{tf("cross_sell.items.3")}</span>
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
  sectionId,
  sectionIcon: Icon,
  tf,
}: {
  tool: Tool;
  sectionId: string;
  sectionIcon: LucideIcon;
  tf: TFn;
}) {
  const base = `sections.${sectionId}.tools.${tool.key}`;
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
            {tf("popular")}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
        {tf(`${base}.name`)}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {tf(`${base}.description`)}
      </p>
      <span className="mt-auto pt-4 text-xs font-semibold text-blue-700 dark:text-blue-300">
        {tf("open_tool")}
      </span>
    </Link>
  );
}

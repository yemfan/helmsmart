import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "RealtyBoss vs. the rest — feature comparison",
  description:
    "Other real-estate CRMs remind you to do the work. RealtyBoss has an AI team that does it for you. See how we compare to Follow Up Boss, kvCORE / BoldTrail, Lofty, BoomTown and Sierra Interactive.",
  keywords: [
    "real estate CRM comparison",
    "Follow Up Boss vs",
    "kvCORE vs",
    "Lofty vs",
    "BoomTown vs",
    "real estate AI CRM",
  ],
  alternates: { canonical: "/agent/compare" },
  openGraph: {
    title: "RealtyBoss vs. the rest — feature comparison",
    description:
      "Side-by-side comparison vs Follow Up Boss, kvCORE / BoldTrail, Lofty, BoomTown, and Sierra Interactive — at a fraction of the price.",
    url: "/agent/compare",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RealtyBoss vs. the rest",
    description:
      "Feature comparison vs Follow Up Boss, kvCORE / BoldTrail, Lofty, BoomTown, and Sierra Interactive.",
  },
};

/**
 * Marketing comparison page — leadsmartai vs. major real-estate
 * CRMs. Static SSR (no client interactivity required).
 *
 * The table is split into category sections so the long list
 * stays scannable. Each cell is one of:
 *   - "✓"  — first-class feature, generally available
 *   - "Limited" — partial / requires add-on / smaller scope
 *   - "—"  — not offered
 *
 * When updating: keep the rows grouped by buyer-journey
 * affordance (lead capture → CRM → AI → marketing → team →
 * differentiators) so prospects can match it to how they evaluate.
 */

type Cell = "yes" | "partial" | "no";

type Row = {
  feature: string;
  /** Short why-it-matters hover, optional. */
  note?: string;
  cells: Record<ProductKey, Cell>;
};

type ProductKey =
  | "leadsmart"
  | "followup_boss"
  | "kvcore"
  | "lofty"
  | "boomtown"
  | "sierra";

const PRODUCTS: Array<{ key: ProductKey; name: string; price: string }> = [
  { key: "leadsmart", name: "RealtyBoss", price: "$79–$199 / mo" },
  { key: "followup_boss", name: "Follow Up Boss", price: "$69–$1,000+ / mo" },
  { key: "kvcore", name: "kvCORE (now BoldTrail)", price: "$499+ / mo" },
  { key: "lofty", name: "Lofty (Chime)", price: "$449+ / mo" },
  { key: "boomtown", name: "BoomTown (now BoldTrail)", price: "$1,500+ / mo" },
  { key: "sierra", name: "Sierra Interactive", price: "$500+ / mo" },
];

type Category = {
  title: string;
  rows: Row[];
};

const CATEGORIES: Category[] = [
  {
    title: "Who does the work?",
    rows: [
      // Everyone reminds you — that's the whole point of the contrast.
      r("Reminders, tasks & 'hot lead' alerts to prompt you", { all: "yes" }),
      r("AI drafts a reply for you to review & send", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "partial",
        lofty: "yes",
        boomtown: "partial",
        sierra: "yes",
      }),
      r("AI autonomously answers & qualifies new leads — no agent in the loop", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "yes",
        boomtown: "no",
        sierra: "partial",
      }),
      r("AI runs CMAs, builds offers & reviews contracts on command", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("AI keeps following up over days without you queuing each step", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "partial",
        sierra: "no",
      }),
    ],
  },
  {
    title: "Core CRM",
    rows: [
      r("Contacts, pipeline, smart lists", { all: "yes" }),
      r("Custom fields on contacts", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Pipeline activity counts per stage", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "yes",
        lofty: "partial",
        boomtown: "yes",
        sierra: "partial",
      }),
      r("Native mobile app (iOS + Android)", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "partial",
      }),
      r("Import contacts from your phone at onboarding", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "no",
      }),
    ],
  },
  {
    title: "AI capabilities",
    rows: [
      r("AI SMS responder — autonomously answers & qualifies leads", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "partial",
        lofty: "yes",
        boomtown: "partial",
        sierra: "partial",
      }),
      r("AI email responder — drafts AND sends, not just suggests", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "partial",
        sierra: "no",
      }),
      r("AI Coaching dashboard with peer benchmarks", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Sales-Model framework (Influencer / Closer / Advisor)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Sphere equity prediction + auto outreach", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "no",
        boomtown: "partial",
        sierra: "no",
      }),
      r("Deal Coach (multi-perspective offer analysis)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("AI-grounded CMA — real cited web comps, not just an AVM", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "partial",
      }),
      r("Boss Assistant — one command runs the whole AI team", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Saved AI house searches with scheduled buyer sends", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "no",
      }),
    ],
  },
  {
    title: "Outbound & engagement",
    rows: [
      r("Click-to-call dialer (phone bridge)", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Email open / click tracking", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Video email (record & send + view analytics)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Newsletter / mass-email composer", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Vanity / call-tracking numbers per source", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "partial",
      }),
      r("Drip campaigns + sphere re-enrollment", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Missed-call text-back (automatic)", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "partial",
        sierra: "no",
      }),
      r("Inbound transaction-email auto-import + AI extraction", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
    ],
  },
  {
    title: "Listing & deal tools",
    rows: [
      r("CMA / comparable sales", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "no",
        sierra: "yes",
      }),
      r("Listing presentation builder", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "no",
        sierra: "no",
      }),
      r("Reviews / testimonial capture (post-close)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "no",
      }),
      r("E-signature integration (Dotloop / DocuSign)", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Buyer Broker Agreement (BBA) workflow", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "no",
      }),
      r("Transaction coordinator + commission forecast", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "no",
        sierra: "yes",
      }),
      r("Deep Report — live loan recompute, HOA + Mello-Roos", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Unified Share on every report (Copy / Email / SMS / PDF)", {
        leadsmart: "yes",
        followup_boss: "partial",
        kvcore: "partial",
        lofty: "partial",
        boomtown: "no",
        sierra: "partial",
      }),
    ],
  },
  {
    title: "Teams & routing",
    rows: [
      r("Team / brokerage hierarchy with seats", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Round-robin lead routing across team", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("ISA workflow + qualified-handoff state machine", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "partial",
        boomtown: "yes",
        sierra: "partial",
      }),
      r("Per-member breakdown / leaderboard reporting", {
        leadsmart: "yes",
        followup_boss: "yes",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
    ],
  },
  {
    title: "Differentiators",
    rows: [
      r("RealtyBoss Coaching (Producer Track + Top Producer Track)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Auto-enrolled coaching with conv-rate + transaction targets", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Bilingual / Chinese-market support (中文)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("WeChat + Xiaohongshu integration", {
        leadsmart: "partial",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Modern AI-native stack (Next.js + Supabase)", {
        leadsmart: "yes",
        followup_boss: "no",
        kvcore: "no",
        lofty: "no",
        boomtown: "no",
        sierra: "no",
      }),
      r("Branded IDX consumer site bundled", {
        leadsmart: "no",
        followup_boss: "no",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
      r("Full MLS sync (RETS / RESO Web API)", {
        leadsmart: "partial",
        followup_boss: "no",
        kvcore: "yes",
        lofty: "yes",
        boomtown: "yes",
        sierra: "yes",
      }),
    ],
  },
];

export default function CompareAgentPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Comparison
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            RealtyBoss vs. the rest
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            How we stack up against Follow Up Boss, kvCORE / BoldTrail, Lofty,
            BoomTown and Sierra Interactive on AI, dialer, e-sign, team
            workflows, and Chinese-market support — at a fraction of the
            price.
          </p>
        </header>

        <WorkVsRemind />

        <Highlights />

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-slate-900">
            Feature-by-feature
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            <span className="mr-3">
              <span className="mr-1 font-semibold text-emerald-700">✓</span>
              first-class
            </span>
            <span className="mr-3">
              <span className="mr-1 font-semibold text-amber-600">◐</span>
              partial / requires add-on
            </span>
            <span>
              <span className="mr-1 font-semibold text-slate-400">—</span>
              not offered
            </span>
          </p>

          <div className="mt-5 -mx-4 overflow-x-auto px-4">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="w-[28%] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Feature
                  </th>
                  {PRODUCTS.map((p) => (
                    <th
                      key={p.key}
                      className={[
                        "px-3 py-3 text-center text-xs font-semibold tracking-wider",
                        p.key === "leadsmart"
                          ? "rounded-t-lg bg-blue-50 text-blue-900"
                          : "uppercase text-slate-500",
                      ].join(" ")}
                    >
                      <div className={p.key === "leadsmart" ? "text-sm" : ""}>
                        {p.name}
                      </div>
                      <div
                        className={[
                          "mt-1 text-[10px] font-normal",
                          p.key === "leadsmart" ? "text-blue-700" : "text-slate-400",
                        ].join(" ")}
                      >
                        {p.price}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => (
                  <CategoryRows key={cat.title} category={cat} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            Stop managing a CRM. Start running a team.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
            Most legacy CRMs charge $500+/month to hand you a longer to-do list.
            RealtyBoss gives you an AI team that works the list for you — answering
            leads, sending replies, and running deals — at a fraction of the price.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/agent/pricing"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              See pricing
            </Link>
            <Link
              href="/agent/start-free"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
            >
              Start free
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-slate-400">
          Comparison data reflects publicly available product pages and
          customer reviews as of the page&apos;s last update. Inside Real
          Estate has consolidated kvCORE and BoomTown into BoldTrail; LionDesk
          was discontinued in September 2025, so it is no longer listed.
          &ldquo;Partial&rdquo; on AI rows means the tool drafts or suggests
          and the agent still reviews and sends. Competitor pricing varies by
          team size + add-ons. We don&apos;t claim every edge case; if
          something looks off please reach out.
        </p>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────

/**
 * The one-line thesis of the whole page: legacy CRMs are reminder engines
 * (tasks, alerts, drip) — the doing stays on the agent. RealtyBoss ships an
 * AI team that executes the work. Everything in the table below is evidence
 * for this contrast.
 */
function WorkVsRemind() {
  return (
    <section className="mt-12 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
        The real difference
      </p>
      <h2 className="mx-auto mt-3 max-w-3xl text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
        Every other CRM reminds you to do the work.{" "}
        <span className="text-blue-700">RealtyBoss does the work for you.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-7 text-slate-600 md:text-base">
        Follow Up Boss, kvCORE, Lofty and the rest are brilliant at telling you
        what to do next — a task list, a &ldquo;this lead is hot&rdquo; alert, a
        drip that fires on schedule. But the calling, texting, emailing,
        researching and follow-up is still on you. RealtyBoss ships an AI team
        that actually <strong className="font-semibold text-slate-900">does it</strong> —
        so the work happens while you&apos;re sitting with clients.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Other CRMs — a reminder engine
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {[
              "Creates a task: “Call this lead” — you still make the call",
              "Alerts you a lead went cold — you write the win-back",
              "Fires a drip on a timer — generic, not a real reply",
              "Surfaces a CMA tool — you assemble the comps yourself",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-0.5 text-slate-400">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            RealtyBoss — an AI team that does it
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {[
              "Answers & qualifies new leads by text and email — autonomously",
              "Drafts and sends the win-back reply in your voice",
              "Runs an AI-grounded CMA with real cited comps on command",
              "Builds the offer, reviews the contract, books the showing for you",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const items: Array<{ title: string; body: string }> = [
    {
      title: "An AI team that does the work",
      body: "Others remind you to call, text, and follow up. RealtyBoss's AI assistants answer leads, draft and send replies, run CMAs, and book showings on your behalf — the work gets done, not just queued.",
    },
    {
      title: "Half the price of enterprise CRMs",
      body: "$79–$199/month covers what BoomTown, kvCORE, and Lofty charge $500–$1,500/month for. No setup fee. No mandatory IDX-website upsell.",
    },
    {
      title: "Bilingual + WeChat ecosystem",
      body: "Chinese-speaking agents and clients are a first-class audience: 中文 templates, WeChat + Xiaohongshu paths, Advisor sales-model. Nobody else does this.",
    },
    {
      title: "Modern stack = faster shipping",
      body: "AI-grounded CMAs with real cited comps, a one-command AI team, inbound transaction-email auto-import — shipped in weeks, not quarters. The pace difference compounds.",
    },
  ];
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {items.map((it) => (
        <div
          key={it.title}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">{it.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

function CategoryRows({ category }: { category: Category }) {
  return (
    <>
      <tr>
        <th
          colSpan={1 + PRODUCTS.length}
          className="bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
        >
          {category.title}
        </th>
      </tr>
      {category.rows.map((row, i) => (
        <tr
          key={`${category.title}-${i}`}
          className="border-t border-slate-100"
        >
          <td className="px-3 py-2.5 text-sm text-slate-800">{row.feature}</td>
          {PRODUCTS.map((p) => (
            <CellMark
              key={p.key}
              cell={row.cells[p.key]}
              isUs={p.key === "leadsmart"}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function CellMark({ cell, isUs }: { cell: Cell; isUs: boolean }) {
  if (cell === "yes") {
    return (
      <td
        className={[
          "px-3 py-2.5 text-center text-base font-semibold",
          isUs ? "bg-blue-50/60 text-emerald-700" : "text-emerald-700",
        ].join(" ")}
        aria-label="Yes"
      >
        ✓
      </td>
    );
  }
  if (cell === "partial") {
    return (
      <td
        className={[
          "px-3 py-2.5 text-center text-base font-semibold",
          isUs ? "bg-blue-50/60 text-amber-600" : "text-amber-600",
        ].join(" ")}
        aria-label="Partial"
      >
        ◐
      </td>
    );
  }
  return (
    <td
      className={[
        "px-3 py-2.5 text-center text-slate-300",
        isUs ? "bg-blue-50/60" : "",
      ].join(" ")}
      aria-label="Not offered"
    >
      —
    </td>
  );
}

function r(feature: string, cells: Partial<Record<ProductKey, Cell>> & { all?: Cell }): Row {
  const full: Record<ProductKey, Cell> = {
    leadsmart: cells.all ?? cells.leadsmart ?? "no",
    followup_boss: cells.all ?? cells.followup_boss ?? "no",
    kvcore: cells.all ?? cells.kvcore ?? "no",
    lofty: cells.all ?? cells.lofty ?? "no",
    boomtown: cells.all ?? cells.boomtown ?? "no",
    sierra: cells.all ?? cells.sierra ?? "no",
  };
  return { feature, cells: full };
}

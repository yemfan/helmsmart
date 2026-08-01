import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";

type TFn = (key: string, opts?: { ns?: string; [k: string]: unknown }) => string;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tc = (key: string): string => t(key, { ns: "web_agent_compare" });
  return {
    title: tc("meta.title"),
    description: tc("meta.description"),
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
      title: tc("meta.og_title"),
      description: tc("meta.og_description"),
      url: "/agent/compare",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: tc("meta.twitter_title"),
      description: tc("meta.twitter_description"),
    },
  };
}

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
  { key: "leadsmart", name: "CloseBoss", price: "$79–$199 / mo" },
  { key: "followup_boss", name: "Follow Up Boss", price: "$69–$1,000+ / mo" },
  { key: "kvcore", name: "kvCORE (now BoldTrail)", price: "$499+ / mo" },
  { key: "lofty", name: "Lofty (Chime)", price: "$449+ / mo" },
  { key: "boomtown", name: "BoomTown (now BoldTrail)", price: "$1,500+ / mo" },
  { key: "sierra", name: "Sierra Interactive", price: "$500+ / mo" },
];

type Category = {
  /** i18n slug under `categories.<key>` in web_agent_compare. */
  key: string;
  rows: Row[];
};

const CATEGORIES: Category[] = [
  {
    key: "work",
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
    key: "core_crm",
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
    key: "ai",
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
      r("Sales-Model framework (Advisor / Closer / Friendly Connector)", {
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
    key: "outbound",
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
    key: "listing",
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
    key: "teams",
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
    key: "differentiators",
    rows: [
      r("CloseBoss Coaching (Producer Track + Top Producer Track)", {
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

export default async function CompareAgentPage() {
  const t = await getServerT();
  const tc: TFn = (key, opts) => t(key, { ns: "web_agent_compare", ...opts });
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            {tc("header.eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            {tc("header.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            {tc("header.subtitle")}
          </p>
        </header>

        <WorkVsRemind tc={tc} />

        <Highlights tc={tc} />

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-slate-900">
            {tc("table.heading")}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            <span className="mr-3">
              <span className="mr-1 font-semibold text-emerald-700">✓</span>
              {tc("table.legend_first_class")}
            </span>
            <span className="mr-3">
              <span className="mr-1 font-semibold text-amber-600">◐</span>
              {tc("table.legend_partial")}
            </span>
            <span>
              <span className="mr-1 font-semibold text-slate-400">—</span>
              {tc("table.legend_not_offered")}
            </span>
          </p>

          <div className="mt-5 -mx-4 overflow-x-auto px-4">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="w-[28%] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {tc("table.col_feature")}
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
                  <CategoryRows key={cat.key} category={cat} tc={tc} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            {tc("cta.heading")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
            {tc("cta.body")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/agent/pricing"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {tc("cta.see_pricing")}
            </Link>
            <Link
              href="/agent/start-free"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
            >
              {tc("cta.start_free")}
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-slate-400">
          {tc("footnote")}
        </p>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────

/**
 * The one-line thesis of the whole page: legacy CRMs are reminder engines
 * (tasks, alerts, drip) — the doing stays on the agent. CloseBoss ships an
 * AI team that executes the work. Everything in the table below is evidence
 * for this contrast.
 */
function WorkVsRemind({ tc }: { tc: TFn }) {
  const reminderItems = [0, 1, 2, 3].map((i) => tc(`work_vs_remind.reminder_items.${i}`));
  const doesItems = [0, 1, 2, 3].map((i) => tc(`work_vs_remind.does_items.${i}`));
  return (
    <section className="mt-12 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
        {tc("work_vs_remind.eyebrow")}
      </p>
      <h2 className="mx-auto mt-3 max-w-3xl text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
        {tc("work_vs_remind.h2_pre")}{" "}
        <span className="text-blue-700">{tc("work_vs_remind.h2_highlight")}</span>
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-7 text-slate-600 md:text-base">
        {tc("work_vs_remind.body_pre")}
        <strong className="font-semibold text-slate-900">{tc("work_vs_remind.body_bold")}</strong>
        {tc("work_vs_remind.body_post")}
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {tc("work_vs_remind.reminder_title")}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {reminderItems.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 text-slate-400">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            {tc("work_vs_remind.does_title")}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {doesItems.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Highlights({ tc }: { tc: TFn }) {
  const items = [0, 1, 2, 3].map((i) => ({
    title: tc(`highlights.${i}.title`),
    body: tc(`highlights.${i}.body`),
  }));
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">{it.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

function CategoryRows({ category, tc }: { category: Category; tc: TFn }) {
  return (
    <>
      <tr>
        <th
          colSpan={1 + PRODUCTS.length}
          className="bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
        >
          {tc(`categories.${category.key}.title`)}
        </th>
      </tr>
      {category.rows.map((row, i) => (
        <tr
          key={`${category.key}-${i}`}
          className="border-t border-slate-100"
        >
          <td className="px-3 py-2.5 text-sm text-slate-800">
            {tc(`categories.${category.key}.rows.${i}`)}
          </td>
          {PRODUCTS.map((p) => (
            <CellMark
              key={p.key}
              cell={row.cells[p.key]}
              isUs={p.key === "leadsmart"}
              tc={tc}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function CellMark({ cell, isUs, tc }: { cell: Cell; isUs: boolean; tc: TFn }) {
  if (cell === "yes") {
    return (
      <td
        className={[
          "px-3 py-2.5 text-center text-base font-semibold",
          isUs ? "bg-blue-50/60 text-emerald-700" : "text-emerald-700",
        ].join(" ")}
        aria-label={tc("table.aria_yes")}
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
        aria-label={tc("table.aria_partial")}
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
      aria-label={tc("table.aria_no")}
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

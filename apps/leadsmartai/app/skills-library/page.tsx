import type { Metadata } from "next";
import Link from "next/link";
import { Download, ShieldCheck, Sparkles } from "lucide-react";

import { SKILLS, PILLAR_LABEL, ASSIGNEE_LABEL, type SkillPillar } from "@/lib/realtyboss/skills/catalog";

export const metadata: Metadata = {
  title: "Free Realtor AI Skills Library — 59 compliance-ready prompts",
  description:
    "A free library of 59 AI skills for real estate agents — lead gen, listings, buyer rep, negotiation, compliance, and ops. Each with the value it captures and a ready-to-run, Fair-Housing-safe prompt. Download free, no signup.",
  keywords: [
    "real estate AI prompts",
    "realtor AI skills",
    "real estate ChatGPT prompts",
    "fair housing compliant listing description",
    "real estate marketing prompts",
    "AI for real estate agents",
  ],
  alternates: { canonical: "/skills-library" },
  openGraph: {
    title: "Free Realtor AI Skills Library — 59 compliance-ready prompts",
    description:
      "59 AI skills for real estate agents, each with a compliance-baked prompt. Free download, no signup.",
    url: "/skills-library",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Free Realtor AI Skills Library", description: "59 compliance-ready AI prompts for real estate agents. Free." },
};

const PILLAR_ORDER: SkillPillar[] = [
  "lead_gen", "nurture", "valuation", "listing", "buyer", "negotiation", "compliance", "communication", "operations",
];

export default function SkillsLibraryPage() {
  const count = SKILLS.length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      {/* Hero */}
      <div className="text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          <Sparkles size={14} aria-hidden /> Free · No signup
        </p>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-white">
          The Realtor AI Skills Library
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-300">
          {count} ready-to-run AI skills for real estate agents — each with the value it captures and a
          compliance-baked prompt (Fair Housing, advertising, RESPA). Wire the placeholders to your data and drop them
          into any AI.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/skills-library/download"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-700 md:text-base"
          >
            <Download size={18} aria-hidden /> Download the library (Markdown)
          </a>
          <Link
            href="/start-free"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            Have the AI run them for you
          </Link>
        </div>
        <p className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={14} aria-hidden /> Not legal advice — templates with compliance guardrails; you and your
          broker review every output.
        </p>
      </div>

      {/* Pillars + skills */}
      <div className="mt-14 space-y-10">
        {PILLAR_ORDER.map((pillar) => {
          const rows = SKILLS.filter((s) => s.pillar === pillar).sort((a, b) => a.num - b.num);
          if (!rows.length) return null;
          return (
            <section key={pillar}>
              <h2 className="border-b border-slate-200 pb-2 font-heading text-xl font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                {PILLAR_LABEL[pillar]}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rows.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {s.num}. {s.title}
                      </h3>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {ASSIGNEE_LABEL[s.defaultAssignee]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.value}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="mt-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-8 text-center text-white">
        <h2 className="font-heading text-2xl font-bold">Don&rsquo;t just prompt — deploy the team.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/90">
          RealtyBoss runs this whole library for you — assigned to your AI Receptionist, Sales, Marketing, Transaction,
          and Accounting assistants, with a Boss Assistant running the compliance gate on every output.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/start-free" className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-slate-50">
            Start free
          </Link>
          <a href="/skills-library/download" className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
            Download the library
          </a>
        </div>
      </div>
    </div>
  );
}

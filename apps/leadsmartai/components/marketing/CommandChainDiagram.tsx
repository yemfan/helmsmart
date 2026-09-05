"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  CheckCircle2,
  ClipboardList,
  Crown,
  DoorOpen,
  FileText,
  Handshake,
  Headphones,
  House,
  MapPin,
  Megaphone,
  PhoneOutgoing,
  Receipt,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * Interactive command-chain diagram for the /features page.
 *
 * The Realtor is the boss: pick a command → the Boss Assistant delegates →
 * the relevant teammates light up and the steps they run appear. Mirrors the
 * org-chart sketch (Realtor → Boss Assistant → fan-out to the team).
 */

type TeamKey = "receptionist" | "sales" | "marketing" | "transaction" | "accountant";

/**
 * The five cards under the Boss Assistant.
 *
 * `labelKey`, not `label`. These were five hardcoded English strings, so the
 * org chart on the Chinese site named its team in English — and the residual-
 * English scan cannot see them, because an object property is neither a JSX
 * text node nor a copy-carrying attribute. The names sat in the one shape that
 * guard has no reach into.
 *
 * The key is stored rather than resolved here: TEAM is module scope, where
 * `t` does not exist yet, and a map built at module scope is exactly how a
 * label ends up looking wired while still rendering English.
 *
 * Short forms of the `boss.team.*` names rather than those names themselves.
 * The card is a fifth of the row at desktop and half at mobile, so "Transaction
 * Coordinator" wraps to three lines; and reusing them would rename Accountant
 * to Financial Analyst on a marketing page, which is a copy decision rather
 * than a translation. That the two sets disagree is worth settling separately.
 */
const TEAM: Array<{ key: TeamKey; labelKey: string; icon: LucideIcon }> = [
  { key: "receptionist", labelKey: "pages.commandChain.team.receptionist", icon: Headphones },
  { key: "sales", labelKey: "pages.commandChain.team.sales", icon: TrendingUp },
  { key: "marketing", labelKey: "pages.commandChain.team.marketing", icon: Megaphone },
  { key: "transaction", labelKey: "pages.commandChain.team.transaction", icon: ClipboardList },
  { key: "accountant", labelKey: "pages.commandChain.team.accountant", icon: Receipt },
];

type Command = {
  id: string;
  chip: string;
  icon: LucideIcon;
  command: string;
  assignees: TeamKey[];
  steps: string[];
  /** The tangible deliverables the team hands back. */
  artifacts: string[];
};

const COMMANDS: Command[] = [
  {
    id: "open_house",
    chip: "Open house",
    icon: DoorOpen,
    command: "“Set up Saturday’s open house at 123 Main St.”",
    assignees: ["marketing", "sales", "receptionist"],
    steps: [
      "Researches the home, comps & neighborhood",
      "Builds the flyer, sign-in & just-listed copy",
      "Markets it to your sphere and the portals",
      "Preps instant follow-up for every sign-in",
    ],
    artifacts: [
      "Just-listed flyer",
      "Open-house sign-in",
      "Social + portal posts",
      "Comps research brief",
      "Follow-up templates",
    ],
  },
  {
    id: "seller_presentation",
    chip: "Seller presentation",
    icon: Sparkles,
    command: "“Build a seller presentation for 123 Main St.”",
    assignees: ["sales"],
    steps: [
      "Pulls live comps and a value range (AI CMA)",
      "Writes the pricing strategy and marketing plan",
      "Adds schools, neighborhood & your branding",
      "Delivers a share-ready, professional report",
    ],
    artifacts: [
      "AI CMA report",
      "Listing presentation (PDF)",
      "Pricing strategy",
      "Marketing plan",
      "Net-to-seller estimate",
    ],
  },
  {
    id: "buyer_showings",
    chip: "Buyer showings",
    icon: MapPin,
    command: "“Find and show homes to the Garcias.”",
    assignees: ["sales"],
    steps: [
      "Searches the market from your plain-English brief",
      "Shortlists matches with deep reports (affordability, ROI)",
      "Books the showings and routes the tour",
      "Emails the buyer the full lineup",
    ],
    artifacts: [
      "Matched shortlist",
      "Property Deep Reports",
      "Comparison report",
      "Showing schedule",
      "Buyer email lineup",
    ],
  },
  {
    id: "cold_call",
    chip: "Cold-call & qualify",
    icon: PhoneOutgoing,
    command: "“Cold-call my new leads and qualify them.”",
    assignees: ["sales", "receptionist"],
    steps: [
      "Researches each lead before dialing",
      "Places the outbound calls in a natural voice",
      "Qualifies on budget, timeline & motivation — buyer or seller",
      "Scores intent, books the hot ones, logs the rest",
    ],
    artifacts: [
      "Qualified lead list",
      "Call notes + transcripts",
      "Intent-scored pipeline",
      "Booked appointments",
    ],
  },
  {
    id: "closing",
    chip: "Coordinate the closing",
    icon: Handshake,
    command: "“Take 123 Main St to closing.”",
    assignees: ["transaction", "accountant"],
    steps: [
      "Builds the transaction timeline and task list",
      "Tracks contingencies, dates & documents",
      "Preps the net-to-seller summary",
      "Logs the commission and expenses",
    ],
    artifacts: [
      "Transaction timeline",
      "Deadline tracker",
      "Net-to-seller sheet",
      "Commission + expense log",
    ],
  },
];

export default function CommandChainDiagram() {
  const { t } = useTranslation("dashboard");
  const [activeId, setActiveId] = useState(COMMANDS[0].id);
  const active = COMMANDS.find((c) => c.id === activeId) ?? COMMANDS[0];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Command picker */}
      <div className="flex flex-wrap justify-center gap-2">
        {COMMANDS.map((c) => {
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                on
                  ? "bg-[#0072ce] text-white ring-[#0072ce]"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
            >
              <c.icon size={14} aria-hidden />
              {c.chip}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-center">
        {/* Realtor — the boss */}
        <div className="w-full max-w-md rounded-2xl border-2 border-[#0072ce] bg-white p-4 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 font-heading text-sm font-bold text-slate-900 dark:text-white">
              <Crown size={16} className="text-[#0072ce]" aria-hidden />{t("pages.commandChain.youTheRealtor")}</p>
            <span className="rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0072ce]">{t("pages.commandChain.theBoss")}</span>
          </div>
          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm italic text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {active.command}
          </div>
        </div>

        <Connector label={t("pages.commandChain.oneCommand")} />

        {/* Boss Assistant */}
        <div className="rounded-full border border-violet-300 bg-violet-50 px-6 py-3 text-center shadow-sm dark:border-violet-700 dark:bg-violet-900/30">
          <p className="inline-flex items-center gap-2 font-heading text-sm font-bold text-violet-900 dark:text-violet-200">
            <House size={16} aria-hidden />{t("pages.commandChain.bossAssistant")}</p>
          <p className="text-[11px] text-violet-700/80 dark:text-violet-300/80">
            {t("pages.commandChain.steps")}
          </p>
        </div>

        <Connector label={t("pages.commandChain.delegatesTo")} fan />

        {/*
         * The team. Every card stays legible: the selected command decides who
         * is HIGHLIGHTED, not who exists.
         *
         * This used to dim the rest to `opacity-50` with slate-400 text, which
         * is the same treatment the app uses for a disabled control — so on the
         * open-house command, Transaction and Accountant read as features that
         * were never built. Someone looking at the /features page asked why the
         * Boss could not command those two. It can; they simply have nothing to
         * do with an open house. Absence of work is not absence of capability,
         * and the two must not look alike.
         */}
        <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-5">
          {TEAM.map((m) => {
            const on = active.assignees.includes(m.key);
            return (
              <div
                key={m.key}
                className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-center transition ${
                  on
                    ? "border-[#0072ce] bg-white shadow-md ring-1 ring-[#0072ce]/30 dark:bg-slate-900"
                    : "border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    on
                      ? "bg-[#0072ce] text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <m.icon size={18} aria-hidden />
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    on
                      ? "text-slate-800 dark:text-slate-100"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {t(m.labelKey)}
                </span>
                {/*
                 * The highlight is colour and weight, which a screen reader
                 * cannot perceive and a colour-blind reader may not either.
                 * Say it in words for both.
                 */}
                <span className="sr-only">
                  {on
                    ? t("pages.commandChain.onThisCommand")
                    : t("pages.commandChain.idle")}
                </span>
              </div>
            );
          })}
        </div>

        {/*
         * And say what the highlighting MEANS. Without this the row reads as a
         * permanent org chart in which two of the five are switched off.
         */}
        <p className="mt-3 max-w-lg text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t("pages.commandChain.teamLegend")}
        </p>

        {/* What the assigned team runs — processes + artifacts */}
        <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.commandChain.whatHappens")}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {active.steps.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                <span>{s}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0072ce]">{t("pages.commandChain.whatYouGet")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {active.artifacts.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <FileText size={12} className="text-[#0072ce]" aria-hidden />
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Connector({ label, fan = false }: { label: string; fan?: boolean }) {
  return (
    <div className="flex flex-col items-center py-2" aria-hidden>
      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
      <span className="my-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <ArrowDown size={16} className={fan ? "text-[#0072ce]" : "text-slate-400"} />
    </div>
  );
}

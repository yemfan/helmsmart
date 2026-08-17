"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, Users } from "lucide-react";

/**
 * Recruit pipeline kanban — demo data only.
 * Mirrors GFI / WFG / Primerica recruit funnel stages.
 *
 * Post-pilot, persist via Supabase: a `recruit_pipeline_card` table with
 * agent_id (upline), stage, fit_score, source, joined_at, last_touched_at.
 */

type Stage = {
  id: string;
  label: string;
  description: string;
  accent: string;
};

const STAGES: Stage[] = [
  {
    id: "interest",
    label: "Interest",
    description: "Showed interest in joining (DM, referral, event).",
    accent: "from-slate-200 to-slate-100 text-slate-700",
  },
  {
    id: "bpm",
    label: "BPM Attended",
    description: "Attended a Business Presentation Meeting.",
    accent: "from-sky-200 to-sky-100 text-sky-800",
  },
  {
    id: "license_started",
    label: "License In Progress",
    description: "Pre-licensing course started; state exam scheduled.",
    accent: "from-amber-200 to-amber-100 text-amber-800",
  },
  {
    id: "licensed",
    label: "Licensed",
    description: "State life license issued; carrier-appointed.",
    accent: "from-violet-200 to-violet-100 text-violet-800",
  },
  {
    id: "first_sale",
    label: "First Sale",
    description: "Submitted first issued policy.",
    accent: "from-emerald-200 to-emerald-100 text-emerald-800",
  },
  {
    id: "promoted",
    label: "Promoted",
    description: "Hit Senior Associate or equivalent threshold.",
    accent: "from-yellow-200 to-yellow-100 text-yellow-800",
  },
];

type RecruitCard = {
  id: string;
  name: string;
  stage: string;
  referredBy: string;
  fitScore: number;
  daysInStage: number;
  notes?: string;
  flag?: "stalled" | "hot";
};

const SEED_RECRUITS: RecruitCard[] = [
  { id: "r1", name: "Jordan Ellis", stage: "bpm", referredBy: "You", fitScore: 84, daysInStage: 2, flag: "hot", notes: "Asked about full-time path post-BPM." },
  { id: "r2", name: "Aaliyah Brown", stage: "license_started", referredBy: "Marcus Webb", fitScore: 79, daysInStage: 14, flag: "stalled", notes: "Hasn't completed module 2." },
  { id: "r3", name: "Chen Wu", stage: "licensed", referredBy: "You", fitScore: 88, daysInStage: 6, notes: "AZ license active. Carrier appt in review." },
  { id: "r4", name: "Reema Khan", stage: "interest", referredBy: "Priya Shah", fitScore: 71, daysInStage: 1, flag: "hot" },
  { id: "r5", name: "Diego Salazar", stage: "interest", referredBy: "Chen Wu", fitScore: 66, daysInStage: 5 },
  { id: "r6", name: "Hannah Kim", stage: "bpm", referredBy: "You", fitScore: 75, daysInStage: 4 },
  { id: "r7", name: "Luis Romero", stage: "bpm", referredBy: "Marcus Webb", fitScore: 80, daysInStage: 9, flag: "stalled" },
  { id: "r8", name: "Ben Carter", stage: "license_started", referredBy: "You", fitScore: 82, daysInStage: 21 },
  { id: "r9", name: "Mia Tanaka", stage: "first_sale", referredBy: "Marcus Webb", fitScore: 91, daysInStage: 3, flag: "hot", notes: "First IUL submitted — congrats due." },
  { id: "r10", name: "Felipe Ortiz", stage: "promoted", referredBy: "You", fitScore: 95, daysInStage: 10, notes: "Promoted to SA last week. Eligible for override bonus." },
];

export default function RecruitPipelineClient() {
  const { t } = useTranslation("dashboard");
  const [filter, setFilter] = useState("");
  const [recruits] = useState(SEED_RECRUITS);

  const byStage = useMemo(() => {
    const map = new Map<string, RecruitCard[]>();
    STAGES.forEach((s) => map.set(s.id, []));
    recruits.forEach((r) => {
      if (filter && !r.name.toLowerCase().includes(filter.toLowerCase())) return;
      const list = map.get(r.stage);
      if (list) list.push(r);
    });
    return map;
  }, [recruits, filter]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    STAGES.forEach((s) => (t[s.id] = byStage.get(s.id)?.length ?? 0));
    return t;
  }, [byStage]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("pages.financialServices.recruitPipeline")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("pages.financialServices.recruitSub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search recruits…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-64 rounded-full border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />{t("pages.financialServices.addRecruit")}</button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {totals[s.id]}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto pb-2">
        <div className="flex min-w-[1100px] gap-4">
          {STAGES.map((s) => (
            <div key={s.id} className="flex w-72 shrink-0 flex-col">
              <div className={`rounded-t-2xl bg-gradient-to-br px-4 py-3 ${s.accent}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{s.label}</p>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {totals[s.id]}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-80">{s.description}</p>
              </div>

              <div className="flex-1 space-y-3 rounded-b-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                {(byStage.get(s.id) ?? []).map((r) => (
                  <article
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          via {r.referredBy === "You" ? "you" : `${r.referredBy} (downline)`}
                        </p>
                      </div>
                      <FitChip score={r.fitScore} />
                    </div>

                    {r.notes && (
                      <p className="mt-2 text-xs text-slate-600">{r.notes}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {r.daysInStage}{t("pages.dashFragments.dInStage")}</span>
                      {r.flag === "stalled" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">{t("pages.financialServices.stalled")}</span>
                      )}
                      {r.flag === "hot" && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">{t("pages.financialServices.hot")}</span>
                      )}
                    </div>
                  </article>
                ))}

                {(byStage.get(s.id) ?? []).length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 py-8 text-center">
                    <Users className="h-5 w-5 text-slate-300" />
                    <p className="mt-1 text-xs text-slate-400">{t("pages.financialServices.noRecruits")}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FitChip({ score }: { score: number }) {
  let tone = "bg-slate-100 text-slate-700";
  if (score >= 85) tone = "bg-emerald-100 text-emerald-800";
  else if (score >= 70) tone = "bg-sky-100 text-sky-800";
  else if (score < 60) tone = "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {score}
    </span>
  );
}

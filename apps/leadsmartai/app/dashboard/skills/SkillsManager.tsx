"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { setSkillOverrideAction } from "./actions";
import type { SkillAssignee } from "@/lib/realtyboss/skills/catalog";

export type SkillRow = {
  id: string;
  num: number;
  title: string;
  pillarLabel: string;
  value: string;
  isValidator: boolean;
  enabled: boolean;
  assignee: SkillAssignee;
};

const ASSIGNEE_ORDER: SkillAssignee[] = [
  "boss",
  "receptionist",
  "sales_assistant",
  "marketing_assistant",
  "transaction_assistant",
  "accountant",
];

export function SkillsManager({
  initial,
  assigneeLabels,
}: {
  initial: SkillRow[];
  assigneeLabels: Record<SkillAssignee, string>;
}) {
  const [skills, setSkills] = useState<SkillRow[]>(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g: Record<SkillAssignee, SkillRow[]> = {
      boss: [], receptionist: [], sales_assistant: [], marketing_assistant: [], transaction_assistant: [], accountant: [],
    };
    for (const s of skills) g[s.assignee].push(s);
    for (const k of ASSIGNEE_ORDER) g[k].sort((a, b) => a.num - b.num);
    return g;
  }, [skills]);

  function patch(id: string, next: Partial<Pick<SkillRow, "enabled" | "assignee">>) {
    const prev = skills;
    setSkills((cur) => cur.map((s) => (s.id === id ? { ...s, ...next } : s)));
    setError(null);
    startTransition(async () => {
      const res = await setSkillOverrideAction(id, next);
      if (!res.ok) {
        setSkills(prev); // revert
        setError(res.error ?? "Couldn't save.");
      }
    });
  }

  const assigneeOptions = ASSIGNEE_ORDER.map((a) => ({ value: a, label: assigneeLabels[a] }));

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {ASSIGNEE_ORDER.map((assignee) => {
        const rows = grouped[assignee];
        const enabledCount = rows.filter((r) => r.enabled).length;
        return (
          <section key={assignee}>
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {assigneeLabels[assignee]}
                {assignee === "boss" ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    validators + oversight
                  </span>
                ) : null}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {enabledCount}/{rows.length} on
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {rows.length === 0 ? (
                <li className="text-sm text-slate-400">No skills assigned.</li>
              ) : (
                rows.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${
                      s.enabled ? "bg-white dark:bg-slate-900" : "bg-slate-50 opacity-70 dark:bg-slate-900/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{s.title}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {s.pillarLabel}
                        </span>
                        {s.isValidator ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            validator
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.value}</p>
                      {s.enabled ? (
                        <Link
                          href={`/dashboard/skills/${s.id}`}
                          className="mt-1.5 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Run →
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={s.enabled}
                        aria-label={`Toggle ${s.title}`}
                        onClick={() => patch(s.id, { enabled: !s.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          s.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${s.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                      <select
                        value={s.assignee}
                        onChange={(e) => patch(s.id, { assignee: e.target.value as SkillAssignee })}
                        aria-label={`Reassign ${s.title}`}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      >
                        {assigneeOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

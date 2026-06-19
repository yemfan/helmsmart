"use client";

import Link from "next/link";
import type { AssistantDef } from "@/lib/realtorboss/team";

/** Header block shared by the AI-team pages — name, mission, skills, action links. */
type AssistantAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export function AssistantHeader({
  assistant,
  actions,
}: {
  assistant: AssistantDef;
  actions?: AssistantAction[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Your AI Team</p>
        <h1 className="mt-0.5 text-xl font-semibold text-gray-900">{assistant.name}</h1>
        <p className="text-sm text-gray-500">{assistant.role} — {assistant.mission}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {assistant.skills.map((s) => (
            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {s.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex shrink-0 gap-2">
          {actions.map((a) =>
            a.href ? (
              <Link key={a.label} href={a.href} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                {a.label}
              </Link>
            ) : (
              <button key={a.label} type="button" onClick={a.onClick} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** KPI stat card used on the AI-team pages. */
export function AssistantKpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: "hot" | "warn";
}) {
  const valueClass = tone === "hot" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value ?? "—"}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

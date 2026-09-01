"use client";

import { RAIL_WORKERS, type WorkerId } from "@/lib/workforce/workers";
import { portraitUrl } from "@/lib/workforce/avatars";

/**
 * "Your AI marketing team" — the workforce rail.
 *
 * Status comes ONLY from steps that actually ran. A worker nobody used renders
 * as idle, and that is the point: showing nine busy specialists when one tool
 * ran would be theatre, and this codebase already refuses to claim patterns it
 * can't evidence (see lib/learnings.ts). The rail should be held to the same bar.
 */

export type WorkerState = "working" | "waiting" | "done" | "idle";

const DOT: Record<WorkerState, string> = {
  working: "bg-emerald-500 animate-pulse",
  waiting: "bg-amber-500",
  done: "bg-slate-400",
  idle: "bg-slate-200",
};

const STATE_LABEL: Record<WorkerState, string> = {
  working: "Working",
  waiting: "Needs you",
  done: "Done",
  idle: "Idle",
};

export default function WorkforceRail({
  states,
  compact,
}: {
  states?: Partial<Record<WorkerId, WorkerState>>;
  /** Horizontal strip (Home) rather than a vertical rail (mission page). */
  compact?: boolean;
}) {
  const anyActive = Object.values(states ?? {}).some((s) => s === "working" || s === "waiting");

  return (
    <section className={compact ? "" : "rounded-2xl border border-slate-200 bg-white p-4"}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Your AI marketing team</h2>
        {!anyActive && <span className="text-[11px] text-slate-400">Standing by</span>}
      </div>

      <ul className={compact ? "flex gap-2 overflow-x-auto pb-1" : "flex flex-col gap-1.5"}>
        {RAIL_WORKERS.map((w) => {
          const state: WorkerState = states?.[w.id] ?? "idle";
          const src = portraitUrl(w.id);
          return (
            <li
              key={w.id}
              title={`${w.name} — ${w.blurb}`}
              className={
                compact
                  ? "flex shrink-0 items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3"
                  : "flex items-center gap-2.5 rounded-xl px-1.5 py-1"
              }
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="size-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                  {w.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[state]}`} />
                  <span className="truncate text-xs font-medium text-slate-900">{w.name}</span>
                </div>
                {!compact && (
                  <p className="truncate text-[11px] text-slate-500">
                    {state === "idle" ? w.role : STATE_LABEL[state]}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

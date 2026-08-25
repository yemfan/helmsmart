"use client";

import { useState } from "react";

type Row = {
  job: string;
  enabled: boolean;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type JobMeta = Record<string, { label: string; path: string; schedule: string }>;

/**
 * On/off for each scheduled job.
 *
 * Green when it runs, grey when it's parked — the same switch shape the other
 * apps use. Flipping one writes a row the cron reads on its next tick, so a job
 * stops without a deploy and the other keeps going.
 */
export default function CronSwitches({ initial, jobs }: { initial: Row[]; jobs: JobMeta }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(job: string, next: boolean) {
    setBusy(job);
    setError(null);
    // Optimistic: the switch should move under the finger, not after a round trip.
    setRows((cur) => cur.map((r) => (r.job === job ? { ...r, enabled: next } : r)));
    try {
      const res = await fetch("/api/admin/crons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, enabled: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { switches?: Row[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save that.");
      if (body.switches) setRows(body.switches);
    } catch (e) {
      // Put it back — a switch that stays where you left it while the server
      // disagreed is worse than one that springs back.
      setRows((cur) => cur.map((r) => (r.job === job ? { ...r, enabled: !next } : r)));
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const meta = jobs[row.job];
        return (
          <div
            key={row.job}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{meta?.label ?? row.job}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  {meta?.path ?? row.job}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {meta?.schedule ?? ""}
                {row.updatedAt ? (
                  <>
                    {" · "}
                    {row.enabled ? "on" : "off"} since {new Date(row.updatedAt).toLocaleString()}
                    {row.updatedBy ? ` (${row.updatedBy})` : ""}
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={row.enabled}
              aria-label={`${meta?.label ?? row.job} — ${row.enabled ? "on" : "off"}`}
              disabled={busy === row.job}
              onClick={() => void toggle(row.job, !row.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                row.enabled ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  row.enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        );
      })}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      <p className="text-[11px] text-slate-500">
        A parked job returns immediately on its next tick — nothing is queued up and replayed when you switch it
        back on.
      </p>
    </div>
  );
}

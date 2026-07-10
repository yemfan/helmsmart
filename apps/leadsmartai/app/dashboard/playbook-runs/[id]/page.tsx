import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getPlaybookRun, getRunTasks } from "@/lib/realtyboss/playbook-runs/service";
import { getPlaybookRunDef } from "@/lib/realtyboss/playbook-runs/definitions";
import type { BuyingPlan, PlaybookArtifact, SellingPlan } from "@/lib/realtyboss/playbook-runs/types";
import { OptimizePanel } from "./OptimizePanel";
import { ApproveRunButton } from "./ApproveRunButton";

const ASSIGNEE_LABEL: Record<string, string> = {
  receptionist: "Receptionist",
  sales_assistant: "Sales Assistant",
  marketing_assistant: "Marketing Assistant",
  transaction_assistant: "Transaction Assistant",
  accountant: "Accountant",
};

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

const PHASE_LABEL: Record<string, string> = {
  prepare: "Prepare",
  marketing_plan: "Marketing plan",
  property_ads: "Ads",
  consultation: "Consultation",
  search_plan: "Search plan",
  execute: "Execute",
  optimize: "Optimize",
};

export default async function PlaybookRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentAgentContext();
  const run = await getPlaybookRun(ctx.agentId, id);
  if (!run) notFound();

  const def = getPlaybookRunDef(run.type);
  const tasks = await getRunTasks(ctx.agentId, id);
  const isSelling = run.type === "house_selling";
  const selling = (run.plan_json ?? {}) as SellingPlan;
  const buying = (run.plan_json ?? {}) as BuyingPlan;
  const artifacts = (run.artifacts_json ?? []) as PlaybookArtifact[];
  const optimizeNotes = (isSelling ? selling.optimizeNotes : buying.optimizeNotes) ?? [];

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "completed" && t.status !== "cancelled");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/dashboard/playbook-runs" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← All playbook runs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{run.title}</h1>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            {isSelling ? "Selling" : "Buying"}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {run.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {def.trigger} · Started {fmtDate(run.created_at)} · Next review {fmtDate(run.next_review_at)}
        </p>
      </div>

      {/* Phases */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">How the team runs this</h2>
        <ol className="mt-3 space-y-2">
          {def.phases.map((p) => (
            <li key={p.key} className="flex gap-3 text-sm">
              <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {PHASE_LABEL[p.key] ?? p.key}
              </span>
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200">{p.title}</span>
                <p className="text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Living plan */}
      {isSelling ? (
        selling.marketingPlan ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Marketing plan</h2>
            {selling.channels?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selling.channels.map((c) => (
                  <span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selling.marketingPlan}</div>
          </section>
        ) : null
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">House-searching plan</h2>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Criteria</dt>
              <dd className="text-slate-800 dark:text-slate-200">{buying.criteria ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Cadence</dt>
              <dd className="text-slate-800 dark:text-slate-200">{buying.frequency ?? "on demand"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Channel</dt>
              <dd className="text-slate-800 dark:text-slate-200">{buying.channel ?? "email"}</dd>
            </div>
          </dl>
          {typeof buying.matchCount === "number" ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{buying.matchCount} matches so far.</p>
          ) : null}
        </section>
      )}

      {/* Ads */}
      {isSelling && selling.ads?.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Custom property ads</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {selling.ads.map((ad, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{ad.angle}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{ad.audience}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{ad.headline}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ad.primaryText}</p>
                <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">{ad.cta}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Artifacts */}
      {artifacts.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Deliverables</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {artifacts.map((a, i) => (
              <li key={i}>
                {a.url ? (
                  <Link href={a.url} className="text-blue-600 hover:underline dark:text-blue-400">
                    {a.title}
                  </Link>
                ) : (
                  <span className="text-slate-700 dark:text-slate-300">{a.title}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Optimize history */}
      {optimizeNotes.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Optimization history</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            {optimizeNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <OptimizePanel runId={run.id} />

      {/* Tasks */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Tasks ({openTasks.length} open)</h2>
          <Link href="/dashboard/tasks" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            Open task board →
          </Link>
        </div>
        <ul className="mt-3 space-y-2.5">
          {tasks.map((t) => {
            const m = t.metadata_json ?? {};
            const isDone = t.status === "done" || t.status === "completed";
            return (
              <li key={t.id} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium ${
                    isDone
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {PHASE_LABEL[m.phase ?? ""] ?? "Task"}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-slate-800 dark:text-slate-200">{t.title}</span>
                  {t.due_at ? <span className="ml-2 text-xs text-slate-400">due {fmtDate(t.due_at)}</span> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {m.assignee ? (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                        {ASSIGNEE_LABEL[m.assignee] ?? m.assignee}
                      </span>
                    ) : m.owner === "agent" ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        You
                      </span>
                    ) : null}
                    {m.dispatch_status === "done" ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓ Ran autonomously</span>
                    ) : m.exec ? (
                      <ApproveRunButton runId={run.id} taskId={t.id} />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {tasks.length === 0 ? <li className="text-sm text-slate-400">No tasks yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}

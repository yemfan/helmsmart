import Link from "next/link";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listPlaybookRuns } from "@/lib/realtyboss/playbook-runs/service";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/**
 * Playbook runs — the agent's stateful selling/buying engagements. Started from
 * the Boss ("start the selling playbook for 123 Main St"); each run drives prep
 * → plan → execute → optimize with the AI team.
 */
export default async function PlaybookRunsPage() {
  const ctx = await getCurrentAgentContext();
  const runs = await listPlaybookRuns(ctx.agentId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Playbook runs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Full-cycle selling &amp; buying engagements your AI team runs — prepare, plan, execute, and optimize as you
          go. Start one from the Boss: e.g. &ldquo;start the selling playbook for 123 Main St&rdquo; or &ldquo;start a
          buying playbook for John — 3b/2b in Alhambra $600k–$1M.&rdquo;
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No playbook runs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Ask the Boss to start a selling playbook (after a listing is signed) or a buying playbook (after a buyer is
            qualified), and it will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/playbook-runs/${r.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">{r.title}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    {r.type === "house_selling" ? "Selling" : "Buying"}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {r.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Phase: {r.phase} · Updated {fmtDate(r.updated_at)} · Next review {fmtDate(r.next_review_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

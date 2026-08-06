import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TEAM_ACTIONS } from "@/lib/team-actions";

/**
 * The "Actions" hub for one AI employee — the page reached from the sidebar's
 * `Overview · Actions` pair. Lists everything that employee can do as cards.
 * Shared across all employees; each route just passes its key.
 */
export function ActionsHub({ member }: { member: string }) {
  const m = TEAM_ACTIONS[member];
  if (!m) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={m.overviewHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {m.title} overview
      </Link>

      <h1 className="text-2xl font-semibold text-slate-900">{m.title} · Actions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything your {m.title} can do. Pick one to get started.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {m.actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
          >
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-indigo-50 group-hover:text-indigo-600">
              {a.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                {a.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-indigo-500" />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                {a.desc}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

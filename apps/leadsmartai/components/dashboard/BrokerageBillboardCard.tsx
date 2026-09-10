import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { billboardForDashboard } from "@/lib/teams/billboard.server";
import { KindBadge } from "@/components/team/BillboardPanel";

/**
 * The brokerage's word on the agent's own dashboard: the newest unread
 * posts (then pinned ones), three at most, with the way to the full board.
 * Renders nothing for an agent on no team or with nothing new to read —
 * a card that says "nothing" is the loudest thing on a quiet page.
 */
export async function BrokerageBillboardCard({ agentId }: { agentId: string }) {
  const board = await billboardForDashboard(agentId).catch(() => null);
  if (!board || board.items.length === 0) return null;
  const t = await getServerT();
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamBillboard.${s}`, { ns: "dashboard", ...vars });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label={k("fromBrokerage", { brokerage: board.brokerage })}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("fromBrokerage", { brokerage: board.brokerage })}</h2>
        <Link href="/dashboard/team#billboard" className="text-xs text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
          {k("seeAll", { count: board.total })}
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {board.items.map((a) => (
          <li key={a.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={a.kind} />
              {!a.mine.read ? <span className="h-2 w-2 rounded-full bg-blue-600" aria-label={k("unread")} /> : null}
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.title}</span>
            </div>
            {a.body ? <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{a.body}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { getAdminOverview, listCompensationChanges } from "@/lib/admin";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents, formatMonthsAsYears } from "@/lib/compensation/format";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card } from "@/components/ui/primitives";
import { StatGrid, StatTile } from "@/components/ui/stat";

export default async function AdminOverviewPage() {
  const [overview, { rules, version }, changes] = await Promise.all([
    getAdminOverview(),
    loadPublicRules(),
    listCompensationChanges(6),
  ]);

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Admin"
      subtitle="Partners, customers, the commission ledger, and the compensation plan they are all priced under."
    >
      <div className="space-y-6">
        {!overview.configured ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            The service role key is not configured, so administrative data cannot be read. Set
            <code className="mx-1 font-mono text-[13px]">SUPABASE_SERVICE_ROLE_KEY</code>
            and redeploy.
          </div>
        ) : null}

        <StatGrid>
          <StatTile
            label="Partners"
            value={overview.partners.total}
            hint={`${overview.partners.active} active`}
          />
          <StatTile
            label="Awaiting approval"
            value={overview.partners.pending}
            tone={overview.partners.pending ? "neutral" : "muted"}
            hint={
              overview.partners.pending ? (
                <Link href="/admin/partners" className="underline underline-offset-4">
                  Review applications
                </Link>
              ) : (
                "Nothing waiting"
              )
            }
          />
          <StatTile
            label="Customers"
            value={overview.customers.total}
            hint={`${overview.customers.active} active`}
          />
          <StatTile
            label="Unprocessed revenue events"
            value={overview.unprocessedEvents}
            tone={overview.unprocessedEvents ? "neutral" : "muted"}
            hint={
              overview.unprocessedEvents ? (
                <Link href="/admin/commissions" className="underline underline-offset-4">
                  Run the commission engine
                </Link>
              ) : (
                "Queue is clear"
              )
            }
          />
        </StatGrid>

        <StatGrid>
          <StatTile label="Pending commission" value={formatCents(overview.commissions.pendingCents)} />
          <StatTile label="Approved" value={formatCents(overview.commissions.approvedCents)} />
          <StatTile label="Paid" value={formatCents(overview.commissions.paidCents)} tone="positive" />
          <StatTile
            label="Reversed"
            value={formatCents(overview.commissions.reversedCents)}
            tone="muted"
          />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                Plan in effect
              </h2>
              <Link
                href="/admin/compensation"
                className="text-sm font-medium text-navy-700 underline underline-offset-4"
              >
                Manage
              </Link>
            </div>
            <p className="mt-3 font-display text-lg font-semibold text-ink">
              {version?.label ?? "Default plan"}
            </p>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row
                term="Direct"
                detail={`${rules.direct.yearRatesBps
                  .slice(0, Math.ceil(rules.direct.durationMonths / 12))
                  .map((b) => formatBps(b))
                  .join(" / ")} over ${formatMonthsAsYears(rules.direct.durationMonths)}`}
              />
              <Row
                term="Override"
                detail={`${formatBps(rules.leadership.generationRatesBps[0] ?? 0)} across ${rules.leadership.maxGenerations} generation(s), ${formatMonthsAsYears(rules.leadership.durationMonths)}`}
              />
              <Row
                term="Leader qualification"
                detail={`${rules.leaderQualification.minPersonalActiveCustomers} customers, ${rules.leaderQualification.minActiveDirectPartners} Direct Partner(s)`}
              />
              <Row
                term="Anchoring"
                detail={
                  rules.versionAnchor === "customer_start"
                    ? "Customers grandfathered onto their signup version"
                    : "All customers priced on the current version"
                }
              />
            </dl>
          </Card>

          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                Recent compensation changes
              </h2>
              <Link
                href="/admin/compensation#history"
                className="text-sm font-medium text-navy-700 underline underline-offset-4"
              >
                Full history
              </Link>
            </div>
            {changes.length ? (
              <ul className="mt-4 space-y-3">
                {changes.map((change) => (
                  <li key={change.id} className="text-sm leading-relaxed text-[#33405a]">
                    {change.summary}
                    <span className="mt-0.5 block text-xs text-muted">
                      {new Date(change.createdAt).toLocaleString()}
                      {change.adminEmail ? ` · ${change.adminEmail}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No compensation changes recorded yet. Every future change to a rate, duration,
                threshold or generation limit appears here with its reason.
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{term}</dt>
      <dd className="text-right text-ink">{detail}</dd>
    </div>
  );
}

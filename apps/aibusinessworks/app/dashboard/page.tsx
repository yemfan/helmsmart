import Link from "next/link";
import { requirePartner, isAdmin } from "@/lib/auth";
import { getPartnerDashboard } from "@/lib/partners";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents } from "@/lib/compensation/format";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { PARTNER_LEVELS, levelForCustomerCount } from "@/content/levels";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  AccountStatusBanner,
  CommissionKindLabel,
  CommissionStatusBadge,
  EmptyState,
  QualificationPanel,
} from "@/components/dashboard/pieces";
import { LevelBadge } from "@/components/site/levels";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import type { CommissionRow } from "@/lib/partners";

export default async function DashboardOverviewPage() {
  const partner = await requirePartner();
  const [data, { rules }, admin] = await Promise.all([
    getPartnerDashboard(partner.id),
    loadPublicRules(),
    isAdmin(),
  ]);

  const level =
    PARTNER_LEVELS.find((l) => l.key === partner.levelKey) ??
    levelForCustomerCount(data.activeCustomerCount);

  const recent = data.commissions.slice(0, 8);

  const columns: Column<CommissionRow>[] = [
    {
      key: "customer",
      header: "Customer",
      primary: true,
      cell: (row) => row.customerName ?? "—",
    },
    {
      key: "kind",
      header: "Type",
      cell: (row) => <CommissionKindLabel kind={row.kind} generation={row.generation} />,
    },
    {
      key: "year",
      header: "Year",
      cell: (row) => `Y${row.commissionYear} · ${formatBps(row.rateBps)}`,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <strong className="font-semibold">{formatCents(row.amountCents, row.currency)}</strong>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => <CommissionStatusBadge status={row.status} />,
    },
  ];

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title={`Welcome, ${partner.firstName}`}
      subtitle={`Partner code ${partner.partnerCode}`}
      badge={
        level ? (
          <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-card">
            <LevelBadge level={level} size={44} />
            <div>
              <div className="font-display text-sm font-semibold text-ink">{level.name}</div>
              <div className="text-xs text-muted">{level.requirement}</div>
            </div>
          </div>
        ) : (
          <Badge tone="neutral">No level yet</Badge>
        )
      }
    >
      <div className="space-y-6">
        <AccountStatusBanner partner={partner} />

        {data.offline ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            This deployment is not connected to a database yet, so your dashboard has nothing to
            show. Commission, customer and payout data appear here once the platform is connected.
          </div>
        ) : null}

        <StatGrid>
          <StatTile
            label="Active customers"
            value={data.activeCustomerCount}
            hint="Referred by you and currently paying"
          />
          <StatTile
            label="Monthly customer revenue"
            value={formatCents(data.monthlyCustomerRevenueCents)}
            hint="Across your active customers"
          />
          <StatTile
            label="Total commission"
            value={formatCents(data.totalCommissionCents)}
            hint="All statuses, net of reversals"
          />
          <StatTile
            label="Active Direct Partners"
            value={data.activeDirectPartnerCount}
            hint="Partners you personally developed"
          />
        </StatGrid>

        <StatGrid>
          <StatTile
            label="Direct commission"
            value={formatCents(data.directCommissionCents)}
            hint="From your own customers"
          />
          <StatTile
            label="Leadership override"
            value={formatCents(data.overrideCommissionCents)}
            hint="From your Direct Partners' customers"
          />
          <StatTile
            label="Pending"
            value={formatCents(data.pendingCommissionCents)}
            hint="Calculated, awaiting approval"
          />
          <StatTile
            label="Paid"
            value={formatCents(data.paidCommissionCents)}
            tone="positive"
            hint="Included in a completed payout"
          />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                Recent commissions
              </h2>
              <Link
                href="/dashboard/commissions"
                className="text-sm font-medium text-navy-700 underline underline-offset-4"
              >
                View all
              </Link>
            </div>
            <div className="mt-4">
              {recent.length ? (
                <ResponsiveTable
                  columns={columns}
                  rows={recent}
                  rowKey={(row) => row.id}
                  caption="Recent commission entries"
                />
              ) : (
                <EmptyState
                  title="No commissions yet"
                  body="Commissions appear here as soon as a customer you referred is billed. Every entry records the plan version, the rate and the qualifying revenue behind it."
                  action={
                    <Link
                      href="/dashboard/links"
                      className="inline-flex rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
                    >
                      Get your referral link
                    </Link>
                  }
                />
              )}
            </div>
          </div>

          <QualificationPanel
            rules={rules}
            activeCustomers={data.activeCustomerCount}
            activeDirectPartners={data.activeDirectPartnerCount}
            academyComplete={Boolean(partner.academyLeadershipCompletedAt)}
            goodStanding={partner.goodStanding}
          />
        </div>

        <Disclaimer>
          Amounts shown are calculated from recorded qualifying revenue under the compensation plan
          version applicable to each customer. Pending amounts are not yet approved for payout and
          may be adjusted by refunds, cancellations or chargebacks.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

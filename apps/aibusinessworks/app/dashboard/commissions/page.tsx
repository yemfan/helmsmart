import type { Metadata } from "next";
import { isAdmin, requirePartner } from "@/lib/auth";
import { getPartnerDashboard, type CommissionRow } from "@/lib/partners";
import { formatBps, formatCents } from "@/lib/compensation/format";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  CommissionKindLabel,
  CommissionStatusBadge,
  EmptyState,
} from "@/components/dashboard/pieces";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Commissions" };

export default async function CommissionsPage() {
  const partner = await requirePartner("/dashboard/commissions");
  const [data, admin] = await Promise.all([getPartnerDashboard(partner.id), isAdmin()]);

  const columns: Column<CommissionRow>[] = [
    {
      key: "customer",
      header: "Customer",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.customerName ?? "—"}</div>
          <div className="text-xs text-muted">{row.productName ?? ""}</div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      cell: (row) => <CommissionKindLabel kind={row.kind} generation={row.generation} />,
    },
    { key: "year", header: "Year", cell: (row) => `Year ${row.commissionYear}` },
    { key: "rate", header: "Rate", align: "right", cell: (row) => formatBps(row.rateBps) },
    {
      key: "qualifying",
      header: "Qualifying revenue",
      align: "right",
      cell: (row) => formatCents(row.qualifyingRevenueCents, row.currency),
    },
    {
      key: "amount",
      header: "Commission",
      align: "right",
      cell: (row) => (
        <strong className={row.amountCents < 0 ? "font-semibold text-rose-700" : "font-semibold"}>
          {formatCents(row.amountCents, row.currency)}
        </strong>
      ),
    },
    { key: "plan", header: "Plan", cell: (row) => row.planLabel },
    {
      key: "date",
      header: "Recorded",
      cell: (row) => new Date(row.createdAt).toLocaleDateString(),
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
      title="Commissions"
      subtitle="Every entry records the plan version, rate and qualifying revenue it was calculated from."
    >
      <div className="space-y-6">
        <StatGrid>
          <StatTile label="Pending" value={formatCents(data.pendingCommissionCents)} />
          <StatTile label="Approved" value={formatCents(data.approvedCommissionCents)} />
          <StatTile
            label="Paid"
            value={formatCents(data.paidCommissionCents)}
            tone="positive"
          />
          <StatTile
            label="Reversed"
            value={formatCents(data.reversedCommissionCents)}
            tone="muted"
            hint="Refunds, cancellations and chargebacks"
          />
        </StatGrid>

        {data.commissions.length ? (
          <ResponsiveTable
            columns={columns}
            rows={data.commissions}
            rowKey={(row) => row.id}
            caption="Commission ledger"
          />
        ) : (
          <EmptyState
            title="Your ledger is empty"
            body="Commission entries are created by the platform when a customer attributed to you is billed. Nothing here is ever edited: a correction is posted as its own reversal entry."
          />
        )}

        <Disclaimer>
          A negative amount is a reversal of an earlier entry, posted when the underlying revenue
          was refunded, cancelled or charged back. Original entries are retained. To ask why a
          specific entry is the amount it is, contact us with the entry date and customer - the
          full calculation trace is stored with every row.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

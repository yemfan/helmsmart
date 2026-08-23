import type { Metadata } from "next";
import { listPayableBalances, listPayouts, type PayableRow, type PayoutRow } from "@/lib/admin";
import { formatCents } from "@/lib/compensation/format";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { createPayout } from "../actions";
import { Badge, Card } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Payouts" };

export default async function AdminPayoutsPage() {
  const [payable, payouts] = await Promise.all([listPayableBalances(), listPayouts()]);
  const totalPayable = payable.reduce((sum, row) => sum + row.approvedCents, 0);

  const payableColumns: Column<PayableRow>[] = [
    { key: "partner", header: "Partner", primary: true, cell: (row) => row.partnerName },
    { key: "entries", header: "Entries", cell: (row) => row.entryCount },
    {
      key: "amount",
      header: "Approved balance",
      align: "right",
      cell: (row) => (
        <strong className="font-semibold">{formatCents(row.approvedCents, row.currency)}</strong>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      cell: (row) => (
        <form action={createPayout}>
          <input type="hidden" name="partnerId" value={row.partnerId} />
          <input type="hidden" name="currency" value={row.currency} />
          <button
            type="submit"
            disabled={row.approvedCents <= 0}
            className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            Create payout
          </button>
        </form>
      ),
    },
  ];

  const payoutColumns: Column<PayoutRow>[] = [
    { key: "partner", header: "Partner", primary: true, cell: (row) => row.partnerName },
    {
      key: "period",
      header: "Period",
      cell: (row) => `${row.periodStart} → ${row.periodEnd}`,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatCents(row.amountCents, row.currency),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <Badge tone={row.status === "paid" ? "success" : row.status === "failed" ? "danger" : "neutral"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Payouts"
      subtitle="Approved commission balances, and the payout records that settle them."
    >
      <div className="space-y-6">
        <StatGrid cols={3}>
          <StatTile label="Payable now" value={formatCents(totalPayable)} />
          <StatTile label="Partners with a balance" value={payable.length} />
          <StatTile label="Payouts created" value={payouts.length} />
        </StatGrid>

        <Card>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            No payment provider is connected
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Creating a payout here records the payout, stamps the covered commission entries with
            its id, and moves them to <strong>PAID</strong>. It does not move money. Connect a
            payment provider before telling Partners a payout has been sent - the platform is
            deliberately provider-agnostic, and the payout record carries an external reference
            field for whichever provider you choose.
          </p>
        </Card>

        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Approved balances
          </h2>
          <div className="mt-5">
            <ResponsiveTable
              columns={payableColumns}
              rows={payable}
              rowKey={(row) => `${row.partnerId}-${row.currency}`}
              empty="No approved commission is waiting for payout. Approve entries on the Commissions tab first."
              caption="Approved commission balances by partner"
            />
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Payout history
          </h2>
          <div className="mt-5">
            <ResponsiveTable
              columns={payoutColumns}
              rows={payouts}
              rowKey={(row) => row.id}
              empty="No payouts have been created yet."
              caption="Payout history"
            />
          </div>
        </div>

        <Disclaimer>
          Payout thresholds, schedules, methods and tax documentation requirements are configured
          per Partner in <code className="font-mono text-[13px]">abw_payout_settings</code>. Tax
          reporting obligations depend on jurisdiction and are not automated by this platform.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

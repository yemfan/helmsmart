import type { Metadata } from "next";
import { getAdminOverview, listCommissionsForAdmin, type AdminCommissionRow } from "@/lib/admin";
import { formatBps, formatCents } from "@/lib/compensation/format";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  approveAllPendingCommissions,
  approveCommission,
  reverseCommissionAction,
  runCommissionEngine,
} from "../actions";
import { Card } from "@/components/ui/primitives";
import { CommissionStatusBadge } from "@/components/dashboard/pieces";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";
import type { CommissionStatus } from "@/lib/compensation/types";

export const metadata: Metadata = { title: "Commissions" };

export default async function AdminCommissionsPage() {
  const [overview, commissions] = await Promise.all([
    getAdminOverview(),
    listCommissionsForAdmin(200),
  ]);

  const columns: Column<AdminCommissionRow>[] = [
    {
      key: "partner",
      header: "Partner",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.partnerName}</div>
          <div className="text-xs text-muted">
            {row.customerName ?? "—"}
            {row.isReversal ? " · reversal" : ""}
          </div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      cell: (row) =>
        row.kind === "direct" ? "Direct" : `Override · gen ${row.generation}`,
    },
    {
      key: "basis",
      header: "Basis",
      cell: (row) =>
        `Y${row.commissionYear} · ${formatBps(row.rateBps)} of ${formatCents(row.qualifyingRevenueCents, row.currency)}`,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <strong className={row.amountCents < 0 ? "font-semibold text-rose-700" : "font-semibold"}>
          {formatCents(row.amountCents, row.currency)}
        </strong>
      ),
    },
    { key: "plan", header: "Plan", cell: (row) => row.planLabel },
    {
      key: "status",
      header: "Status",
      cell: (row) => <CommissionStatusBadge status={row.status as CommissionStatus} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => <RowActions row={row} />,
    },
  ];

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Commissions"
      subtitle="Run the engine, approve for payout, and post reversals. Nothing here edits an existing entry."
    >
      <div className="space-y-6">
        <StatGrid>
          <StatTile label="Pending" value={formatCents(overview.commissions.pendingCents)} />
          <StatTile label="Approved" value={formatCents(overview.commissions.approvedCents)} />
          <StatTile label="Paid" value={formatCents(overview.commissions.paidCents)} tone="positive" />
          <StatTile
            label="Reversed"
            value={formatCents(overview.commissions.reversedCents)}
            tone="muted"
          />
        </StatGrid>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                Commission engine
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                {overview.unprocessedEvents === 0
                  ? "Every recorded revenue event has been through the engine."
                  : `${overview.unprocessedEvents} revenue event${overview.unprocessedEvents === 1 ? " has" : "s have"} not been through the engine yet.`}{" "}
                Running it is idempotent - an event that has already produced commissions produces
                nothing new.
              </p>
            </div>
            <form action={runCommissionEngine}>
              <button
                type="submit"
                className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
              >
                Run engine
              </button>
            </form>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Ledger</h2>
          <form action={approveAllPendingCommissions}>
            <button
              type="submit"
              className="rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300"
            >
              Approve all pending
            </button>
          </form>
        </div>

        <ResponsiveTable
          columns={columns}
          rows={commissions}
          rowKey={(row) => row.id}
          empty="No commissions have been calculated yet. Record a revenue event on the Customers tab, then run the engine."
          caption="Commission ledger"
        />

        {commissions.length ? (
          <details className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
            <summary className="cursor-pointer font-display text-base font-semibold text-ink">
              Why did a Partner receive this exact commission?
            </summary>
            <div className="mt-5 space-y-6">
              {commissions.slice(0, 10).map((row) => (
                <div key={row.id} className="border-t border-hairline pt-5 first:border-0 first:pt-0">
                  <div className="text-sm font-semibold text-ink">
                    {row.partnerName} · {formatCents(row.amountCents, row.currency)} ·{" "}
                    {row.planLabel}
                  </div>
                  <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
                    {row.explanation.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <Disclaimer>
          Reversing a commission writes a new, mirror-image entry that points back at the original
          and flips the original&apos;s status. The original amount, rate, plan version and
          calculation trace are never altered.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

function RowActions({ row }: { row: AdminCommissionRow }) {
  const canApprove = row.status === "PENDING" && row.amountCents >= 0;
  const canReverse = !row.isReversal && ["PENDING", "APPROVED", "PAID"].includes(row.status);

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canApprove ? (
        <form action={approveCommission}>
          <input type="hidden" name="commissionId" value={row.id} />
          <button
            type="submit"
            className="rounded-xl bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800"
          >
            Approve
          </button>
        </form>
      ) : null}
      {canReverse ? (
        <form action={reverseCommissionAction} className="flex items-center gap-1.5">
          <input type="hidden" name="commissionId" value={row.id} />
          <input
            type="text"
            name="reason"
            required
            placeholder="Reason"
            className="w-28 rounded-lg border border-hairline px-2 py-1.5 text-xs text-ink outline-none focus:border-navy-400"
          />
          <select
            name="kind"
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs text-ink outline-none focus:border-navy-400"
            defaultValue="REVERSED"
          >
            <option value="REVERSED">Reverse</option>
            <option value="REFUNDED">Refund</option>
            <option value="CHARGEBACK">Chargeback</option>
          </select>
          <button
            type="submit"
            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:border-rose-300"
          >
            Post
          </button>
        </form>
      ) : null}
    </div>
  );
}

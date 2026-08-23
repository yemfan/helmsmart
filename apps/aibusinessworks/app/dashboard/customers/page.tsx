import Link from "next/link";
import type { Metadata } from "next";
import { isAdmin, requirePartner } from "@/lib/auth";
import { getPartnerDashboard, type CustomerRow } from "@/lib/partners";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents } from "@/lib/compensation/format";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/dashboard/pieces";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Customers" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  trialing: "neutral",
  past_due: "warning",
  cancelled: "danger",
  refunded: "danger",
};

export default async function CustomersPage() {
  const partner = await requirePartner("/dashboard/customers");
  const [data, { rules }, admin] = await Promise.all([
    getPartnerDashboard(partner.id),
    loadPublicRules(),
    isAdmin(),
  ]);

  const columns: Column<CustomerRow>[] = [
    {
      key: "customer",
      header: "Customer",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.displayName}</div>
          {row.company ? <div className="text-xs text-muted">{row.company}</div> : null}
        </div>
      ),
    },
    { key: "product", header: "Product", cell: (row) => row.productName ?? "—" },
    { key: "plan", header: "Subscription", cell: (row) => row.planName ?? "—" },
    {
      key: "monthly",
      header: "Monthly",
      align: "right",
      cell: (row) => formatCents(row.monthlyCents, row.currency),
    },
    {
      key: "started",
      header: "Started",
      cell: (row) => new Date(row.startedAt).toLocaleDateString(),
    },
    {
      key: "year",
      header: "Commission year",
      cell: (row) => {
        const rate = rules.direct.yearRatesBps[row.commissionYear - 1];
        const withinPlan = row.commissionYear * 12 <= rules.direct.durationMonths + 11;
        return withinPlan && rate ? `Year ${row.commissionYear} · ${formatBps(rate)}` : "Ended";
      },
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status.replace("_", " ")}</Badge>
      ),
    },
  ];

  const activeCount = data.activeCustomerCount;

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Customers"
      subtitle="Businesses attributed to you, and where each one sits in its commission period."
    >
      <div className="space-y-6">
        <StatGrid cols={3}>
          <StatTile label="Active customers" value={activeCount} />
          <StatTile
            label="Monthly customer revenue"
            value={formatCents(data.monthlyCustomerRevenueCents)}
          />
          <StatTile label="All-time customers" value={data.customers.length} />
        </StatGrid>

        {data.customers.length ? (
          <ResponsiveTable
            columns={columns}
            rows={data.customers}
            rowKey={(row) => row.id}
            caption="Customers attributed to you"
          />
        ) : (
          <EmptyState
            title="No customers yet"
            body="A customer appears here when a business subscribes through your referral link or discount code. Attribution is recorded at the moment of subscription."
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

        <Disclaimer>
          The commission year shown is calculated from each customer&apos;s start date. The rate
          displayed is the rate published in the plan version that customer is priced under;
          the amount actually earned on any invoice is recorded on the commission entry itself.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

import type { Metadata } from "next";
import { isAdmin, requirePartner } from "@/lib/auth";
import { getPartnerDashboard, type DirectPartnerRow } from "@/lib/partners";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents } from "@/lib/compensation/format";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { PARTNER_LEVELS } from "@/content/levels";
import { DashboardShell } from "@/components/dashboard/shell";
import { EmptyState, QualificationPanel } from "@/components/dashboard/pieces";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Direct Partners" };

export default async function DirectPartnersPage() {
  const partner = await requirePartner("/dashboard/partners");
  const [data, { rules }, admin] = await Promise.all([
    getPartnerDashboard(partner.id),
    loadPublicRules(),
    isAdmin(),
  ]);

  const columns: Column<DirectPartnerRow>[] = [
    { key: "name", header: "Partner", primary: true, cell: (row) => row.name },
    {
      key: "level",
      header: "Level",
      cell: (row) =>
        PARTNER_LEVELS.find((l) => l.key === row.levelKey)?.name ?? "—",
    },
    {
      key: "joined",
      header: "Joined",
      cell: (row) => new Date(row.joinedAt).toLocaleDateString(),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <Badge tone={row.status === "active" ? "success" : row.status === "pending" ? "warning" : "danger"}>
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Direct Partners"
      subtitle="Partners you personally developed. Their customer revenue is what a Leadership Override is paid on."
    >
      <div className="space-y-6">
        <StatGrid cols={3}>
          <StatTile label="Direct Partners" value={data.directPartners.length} />
          <StatTile label="Active" value={data.activeDirectPartnerCount} />
          <StatTile
            label="Override earned"
            value={formatCents(data.overrideCommissionCents)}
            hint={`At ${formatBps(rules.leadership.generationRatesBps[0] ?? 0)} of qualifying revenue`}
          />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            {data.directPartners.length ? (
              <ResponsiveTable
                columns={columns}
                rows={data.directPartners}
                rowKey={(row) => row.id}
                caption="Your Direct Partners"
              />
            ) : (
              <EmptyState
                title="No Direct Partners yet"
                body="A Partner becomes your Direct Partner when they register through your referral link. Developing Partners matters only once they serve customers - the override is paid on customer revenue, not on signups."
              />
            )}
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
          You can see the status and level of the Partners you personally sponsor. You cannot see
          their customers, their commissions or any other Partner&apos;s financial data - that
          restriction is enforced at the database, not just in this interface.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

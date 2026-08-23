import type { Metadata } from "next";
import { listPartnersForAdmin, type AdminPartnerRow } from "@/lib/admin";
import { PARTNER_LEVELS } from "@/content/levels";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { recalculatePartnerLevels, setPartnerStanding, setPartnerStatus } from "../actions";
import { Badge, Card } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { StatGrid, StatTile } from "@/components/ui/stat";

export const metadata: Metadata = { title: "Partners" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  terminated: "danger",
};

export default async function AdminPartnersPage() {
  const partners = await listPartnersForAdmin();
  const pending = partners.filter((p) => p.status === "pending");

  const columns: Column<AdminPartnerRow>[] = [
    {
      key: "partner",
      header: "Partner",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.name}</div>
          <div className="text-xs text-muted">{row.email}</div>
        </div>
      ),
    },
    { key: "code", header: "Code", cell: (row) => <span className="font-mono text-[13px]">{row.partnerCode}</span> },
    { key: "sponsor", header: "Sponsor", cell: (row) => row.sponsorName ?? "—" },
    {
      key: "level",
      header: "Level",
      cell: (row) => PARTNER_LEVELS.find((l) => l.key === row.levelKey)?.name ?? "—",
    },
    {
      key: "applied",
      header: "Applied",
      cell: (row) => new Date(row.appliedAt).toLocaleDateString(),
    },
    {
      key: "standing",
      header: "Standing",
      cell: (row) =>
        row.goodStanding ? (
          <Badge tone="success">Good</Badge>
        ) : (
          <Badge tone="danger">Under review</Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => <PartnerActions partner={row} />,
    },
  ];

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Partners"
      subtitle="Approve applications, manage standing, and recompute recognition levels."
    >
      <div className="space-y-6">
        <StatGrid>
          <StatTile label="Total" value={partners.length} />
          <StatTile
            label="Awaiting approval"
            value={pending.length}
            tone={pending.length ? "neutral" : "muted"}
          />
          <StatTile label="Active" value={partners.filter((p) => p.status === "active").length} />
          <StatTile
            label="Suspended or closed"
            value={partners.filter((p) => ["suspended", "terminated"].includes(p.status)).length}
            tone="muted"
          />
        </StatGrid>

        {pending.length ? (
          <Card>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">
              {pending.length} application{pending.length === 1 ? "" : "s"} awaiting review
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Approving a Partner activates their referral link and discount code, opens the
              Academy and the resource library, and lets them publish a public profile.
            </p>
            <ul className="mt-5 divide-y divide-hairline border-t border-hairline">
              {pending.map((partner) => (
                <li key={partner.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <div className="font-semibold text-ink">{partner.name}</div>
                    <div className="text-xs text-muted">
                      {partner.email}
                      {partner.businessName ? ` · ${partner.businessName}` : ""}
                      {partner.country ? ` · ${partner.country}` : ""}
                      {partner.sponsorName ? ` · sponsored by ${partner.sponsorName}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <StatusButton
                      partnerId={partner.id}
                      status="active"
                      label="Approve"
                      tone="primary"
                    />
                    <StatusButton
                      partnerId={partner.id}
                      status="terminated"
                      label="Decline"
                      tone="danger"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            All partners
          </h2>
          <form action={recalculatePartnerLevels}>
            <button
              type="submit"
              className="rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300"
            >
              Recalculate levels
            </button>
          </form>
        </div>

        <ResponsiveTable
          columns={columns}
          rows={partners}
          rowKey={(row) => row.id}
          empty="No partners have registered yet."
          caption="All partners"
        />
      </div>
    </DashboardShell>
  );
}

function StatusButton({
  partnerId,
  status,
  label,
  tone,
}: {
  partnerId: string;
  status: string;
  label: string;
  tone: "primary" | "danger" | "secondary";
}) {
  const classes = {
    primary: "bg-navy-900 text-white hover:bg-navy-800",
    danger: "border border-rose-200 bg-white text-rose-700 hover:border-rose-300",
    secondary: "border border-hairline bg-white text-navy-700 hover:border-navy-300",
  }[tone];

  return (
    <form action={setPartnerStatus}>
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${classes}`}
      >
        {label}
      </button>
    </form>
  );
}

function PartnerActions({ partner }: { partner: AdminPartnerRow }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {partner.status !== "active" ? (
        <StatusButton partnerId={partner.id} status="active" label="Activate" tone="secondary" />
      ) : (
        <StatusButton partnerId={partner.id} status="suspended" label="Suspend" tone="danger" />
      )}
      <form action={setPartnerStanding}>
        <input type="hidden" name="partnerId" value={partner.id} />
        <input type="hidden" name="goodStanding" value={String(!partner.goodStanding)} />
        <button
          type="submit"
          className="rounded-xl border border-hairline bg-white px-3 py-2 text-xs font-semibold text-navy-700 hover:border-navy-300"
        >
          {partner.goodStanding ? "Flag standing" : "Clear standing"}
        </button>
      </form>
    </div>
  );
}

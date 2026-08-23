import type { Metadata } from "next";
import { listAuditLog, listCompensationChanges, type AuditRow } from "@/lib/admin";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Audit" };

const ACTION_TONE = (action: string) => {
  if (action.startsWith("commission.reversed") || action.includes("suspended")) return "danger";
  if (action.startsWith("compensation.")) return "gold";
  if (action.includes("approved") || action.includes("active")) return "success";
  return "neutral";
};

export default async function AdminAuditPage() {
  const [audit, compensationChanges] = await Promise.all([
    listAuditLog(300),
    listCompensationChanges(100),
  ]);

  const columns: Column<AuditRow>[] = [
    {
      key: "action",
      header: "Action",
      primary: true,
      cell: (row) => (
        <Badge tone={ACTION_TONE(row.action) as "neutral" | "success" | "danger" | "gold"}>
          {row.action}
        </Badge>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => (
        <span className="font-mono text-[12px]">
          {row.entityType}
          {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
        </span>
      ),
    },
    { key: "actor", header: "Actor", cell: (row) => row.actorEmail ?? "system" },
    { key: "reason", header: "Reason", cell: (row) => row.reason ?? "—" },
    {
      key: "when",
      header: "When",
      align: "right",
      cell: (row) => new Date(row.createdAt).toLocaleString(),
    },
  ];

  const changeColumns: Column<(typeof compensationChanges)[number]>[] = [
    { key: "summary", header: "Change", primary: true, cell: (row) => row.summary },
    { key: "admin", header: "Administrator", cell: (row) => row.adminEmail ?? "—" },
    { key: "reason", header: "Reason", cell: (row) => row.reason ?? "—" },
    {
      key: "when",
      header: "When",
      align: "right",
      cell: (row) => new Date(row.createdAt).toLocaleString(),
    },
  ];

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Audit"
      subtitle="Who changed what, when, and why."
    >
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Compensation changes
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Also visible to every Partner, by design.
          </p>
          <div className="mt-5">
            <ResponsiveTable
              columns={changeColumns}
              rows={compensationChanges}
              rowKey={(row) => String(row.id)}
              empty="No compensation changes recorded yet."
              caption="Compensation change log"
            />
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Platform audit log
          </h2>
          <div className="mt-5">
            <ResponsiveTable
              columns={columns}
              rows={audit}
              rowKey={(row) => String(row.id)}
              empty="Nothing recorded yet."
              caption="Platform audit log"
            />
          </div>
        </div>

        <Disclaimer>
          Audit rows are append-only. Partner registrations, approvals, standing changes, engine
          runs, commission approvals, reversals, payouts, compensation versions and legal
          publications all write here.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

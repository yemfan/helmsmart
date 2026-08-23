import type { Metadata } from "next";
import { listCustomersForAdmin, type AdminCustomerRow } from "@/lib/admin";
import { formatCents } from "@/lib/compensation/format";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { recordRevenueEvent } from "../actions";
import { Badge, Card } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Customers" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  trialing: "neutral",
  past_due: "warning",
  cancelled: "danger",
  refunded: "danger",
};

export default async function AdminCustomersPage() {
  const customers = await listCustomersForAdmin();
  const withSubscription = customers.filter((c) => c.subscriptionId);

  const columns: Column<AdminCustomerRow>[] = [
    {
      key: "customer",
      header: "Customer",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.displayName}</div>
          <div className="text-xs text-muted">{row.company ?? row.email ?? ""}</div>
        </div>
      ),
    },
    { key: "partner", header: "Attributed to", cell: (row) => row.partnerName ?? "Unattributed" },
    { key: "product", header: "Product", cell: (row) => row.productName ?? "—" },
    { key: "plan", header: "Plan", cell: (row) => row.planName ?? "—" },
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
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status.replace("_", " ")}</Badge>
      ),
    },
  ];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardShell
      nav={[...ADMIN_NAV]}
      isAdmin
      title="Customers"
      subtitle="Every customer, who they are attributed to, and the revenue events that drive commission."
    >
      <div className="space-y-6">
        <ResponsiveTable
          columns={columns}
          rows={customers}
          rowKey={(row) => row.id}
          empty="No customers recorded yet. Connect billing, or add a customer and subscription directly in the database, then record revenue events below."
          caption="All customers"
        />

        <Card>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            Record a revenue event
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Until a billing integration is connected, this is how a billing fact reaches the
            commission engine. It writes to the same table a billing webhook would, so the
            calculation path is identical. Enter a refund or chargeback amount to produce a
            reversal.
          </p>

          {withSubscription.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-hairline bg-canvas-alt px-4 py-6 text-center text-sm text-muted">
              No subscriptions exist yet, so there is nothing to record revenue against.
            </p>
          ) : (
            <form action={recordRevenueEvent} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Subscription">
                <select
                  name="subscriptionId"
                  required
                  className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                >
                  {withSubscription.map((customer) => (
                    <option key={customer.subscriptionId ?? customer.id} value={customer.subscriptionId ?? ""}>
                      {customer.displayName} · {customer.productName ?? "—"} ·{" "}
                      {formatCents(customer.monthlyCents, customer.currency)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Event type">
                <select
                  name="eventType"
                  defaultValue="renewal"
                  className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                >
                  <option value="new_subscription">New subscription</option>
                  <option value="renewal">Renewal</option>
                  <option value="upgrade">Upgrade</option>
                  <option value="add_on">Add-on</option>
                  <option value="expansion">Expansion</option>
                  <option value="one_time">One-time charge</option>
                </select>
              </Field>

              <Field label="Occurred on">
                <input
                  type="date"
                  name="occurredAt"
                  defaultValue={today}
                  required
                  className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                />
              </Field>

              <Field label="Gross billed ($)">
                <NumberInput name="grossDollars" defaultValue="99" />
              </Field>
              <Field label="Tax ($)">
                <NumberInput name="taxDollars" defaultValue="0" />
              </Field>
              <Field label="Discount ($)">
                <NumberInput name="discountDollars" defaultValue="0" />
              </Field>
              <Field label="Refunded ($)">
                <NumberInput name="refundDollars" defaultValue="0" />
              </Field>
              <Field label="Chargeback ($)">
                <NumberInput name="chargebackDollars" defaultValue="0" />
              </Field>
              <Field label="Reference">
                <input
                  type="text"
                  name="reference"
                  placeholder="Invoice number (optional)"
                  className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-400"
                />
              </Field>

              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
                >
                  Record event
                </button>
                <p className="mt-2 text-xs text-muted">
                  Recording an event does not create commissions on its own. Run the engine on the
                  Commissions tab.
                </p>
              </div>
            </form>
          )}
        </Card>

        <Disclaimer>
          Revenue events are immutable billing facts. A correction is recorded as a new event, not
          as an edit - the same discipline the commission ledger follows.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function NumberInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <input
      type="number"
      name={name}
      step="0.01"
      min="0"
      defaultValue={defaultValue}
      className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-navy-400"
    />
  );
}

import type { Metadata } from "next";
import { listCompensationChanges } from "@/lib/admin";
import { hasServiceRole, createAdminClient } from "@/lib/supabase/admin";
import { parseRules } from "@/lib/compensation/repository";
import { DEFAULT_COMPENSATION_RULES } from "@/lib/compensation/defaults";
import { describeRules } from "@/lib/compensation/diff";
import { ADMIN_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { CompensationEditor } from "@/components/admin/compensation-editor";
import { Badge, Card } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Disclaimer } from "@/components/ui/disclaimer";
import type { CompensationRules } from "@/lib/compensation/types";

export const metadata: Metadata = { title: "Compensation" };

interface VersionRow {
  id: string;
  planKey: string;
  planName: string;
  version: number;
  label: string;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  rules: CompensationRules;
}

async function loadVersions(): Promise<{
  versions: VersionRow[];
  defaultPlan: { id: string; name: string } | null;
}> {
  if (!hasServiceRole()) return { versions: [], defaultPlan: null };
  const supabase = createAdminClient();

  const [{ data: plans }, { data: versions }] = await Promise.all([
    supabase.from("abw_compensation_plans").select("id, key, name, is_default").is("archived_at", null),
    supabase
      .from("abw_compensation_plan_versions")
      .select("id, plan_id, version, label, status, effective_from, effective_until, rules")
      .order("effective_from", { ascending: false }),
  ]);

  const planById = new Map((plans ?? []).map((p) => [p.id as string, p]));
  const defaultPlan = (plans ?? []).find((p) => p.is_default);

  return {
    versions: (versions ?? []).map((v) => {
      const plan = planById.get(v.plan_id as string);
      return {
        id: v.id as string,
        planKey: (plan?.key as string) ?? "unknown",
        planName: (plan?.name as string) ?? "Unknown plan",
        version: v.version as number,
        label: v.label as string,
        status: v.status as string,
        effectiveFrom: v.effective_from as string,
        effectiveUntil: v.effective_until as string | null,
        rules: parseRules(v.rules),
      };
    }),
    defaultPlan: defaultPlan
      ? { id: defaultPlan.id as string, name: defaultPlan.name as string }
      : null,
  };
}

export default async function AdminCompensationPage() {
  const [{ versions, defaultPlan }, changes] = await Promise.all([
    loadVersions(),
    listCompensationChanges(200),
  ]);

  const now = Date.now();
  const live =
    versions.find(
      (v) =>
        v.status === "active" &&
        new Date(v.effectiveFrom).getTime() <= now &&
        (!v.effectiveUntil || new Date(v.effectiveUntil).getTime() > now),
    ) ?? versions.find((v) => v.status === "active") ?? null;

  const currentRules = live?.rules ?? DEFAULT_COMPENSATION_RULES;
  const nextVersionNumber =
    Math.max(0, ...versions.filter((v) => v.planKey === (live?.planKey ?? "default")).map((v) => v.version)) + 1;

  const versionColumns: Column<VersionRow>[] = [
    {
      key: "label",
      header: "Version",
      primary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.label}</div>
          <div className="text-xs text-muted">
            {row.planName} · v{row.version}
          </div>
        </div>
      ),
    },
    {
      key: "window",
      header: "Effective",
      cell: (row) =>
        `${row.effectiveFrom} → ${row.effectiveUntil ?? "open-ended"}`,
    },
    {
      key: "direct",
      header: "Direct",
      cell: (row) =>
        row.rules.direct.yearRatesBps
          .slice(0, Math.ceil(row.rules.direct.durationMonths / 12))
          .map((b) => `${b / 100}%`)
          .join(" / "),
    },
    {
      key: "override",
      header: "Override",
      align: "right",
      cell: (row) => `${(row.rules.leadership.generationRatesBps[0] ?? 0) / 100}%`,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (row) => (
        <Badge
          tone={row.status === "active" ? "success" : row.status === "draft" ? "warning" : "neutral"}
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  const changeColumns: Column<(typeof changes)[number]>[] = [
    {
      key: "summary",
      header: "Change",
      primary: true,
      cell: (row) => (
        <div>
          <div className="text-ink">{row.summary}</div>
          {row.reason ? <div className="mt-1 text-xs text-muted">Reason: {row.reason}</div> : null}
        </div>
      ),
    },
    { key: "admin", header: "Administrator", cell: (row) => row.adminEmail ?? "—" },
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
      title="Compensation"
      subtitle="Every rate, duration and threshold in the program is set here. Nothing is hard-coded in the site."
    >
      <div className="space-y-8">
        {!hasServiceRole() ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            The service role key is not configured, so compensation plans cannot be read or edited.
          </div>
        ) : null}

        {/* Current plan at a glance */}
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">
              Currently in effect: {live?.label ?? "seeded default"}
            </h2>
            {live ? (
              <span className="text-xs text-muted">
                {live.planName} · effective {live.effectiveFrom}
                {live.effectiveUntil ? ` until ${live.effectiveUntil}` : ""}
              </span>
            ) : null}
          </div>
          <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {describeRules(currentRules).map((item) => (
              <div key={item.label} className="flex justify-between gap-4 text-sm">
                <dt className="text-muted">{item.label}</dt>
                <dd className="text-right font-medium text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Editor */}
        {defaultPlan || live ? (
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
              Change the plan
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">
              Adjust the settings below and save. This creates a new plan version with its own
              effective date and writes a field-level entry to the compensation change log.
              Commissions already calculated keep pointing at the version they were priced under.
            </p>
            <div className="mt-6">
              <CompensationEditor
                planId={defaultPlan?.id ?? ""}
                planName={defaultPlan?.name ?? live?.planName ?? "Default plan"}
                currentRules={currentRules}
                currentLabel={live?.label ?? "the seeded default"}
                suggestedLabel={`Plan V${nextVersionNumber}`}
                suggestedEffectiveFrom={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
        ) : null}

        {/* Versions */}
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Plan versions
          </h2>
          <div className="mt-5">
            <ResponsiveTable
              columns={versionColumns}
              rows={versions}
              rowKey={(row) => row.id}
              empty="No plan versions found. Run the seed migration to create Plan V1."
              caption="Compensation plan versions"
            />
          </div>
        </div>

        {/* Change history */}
        <div id="history" className="scroll-mt-24">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Compensation change history
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Visible to every Partner. This is the record a dispute is settled from.
          </p>
          <div className="mt-5">
            <ResponsiveTable
              columns={changeColumns}
              rows={changes}
              rowKey={(row) => String(row.id)}
              empty="No compensation changes recorded yet."
              caption="Compensation change log"
            />
          </div>
        </div>

        <Disclaimer>
          Changing a rate here changes what the public site displays and what future commissions are
          calculated at. It does not, and cannot, recalculate a commission that has already been
          written - the ledger is append-only and each row stores the plan version it used.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

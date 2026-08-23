import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui/primitives";
import { formatBps } from "@/lib/compensation/format";
import type { CommissionStatus } from "@/lib/compensation/types";
import type { PartnerAccount } from "@/lib/auth";
import type { CompensationRules } from "@/lib/compensation/types";

/* -------------------------------------------------------------------------- */
/*  Account status                                                             */
/* -------------------------------------------------------------------------- */

export function AccountStatusBanner({ partner }: { partner: PartnerAccount }) {
  if (partner.status === "active") return null;

  const copy: Record<string, { tone: string; title: string; body: ReactNode }> = {
    pending: {
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Your Partner account is pending review",
      body: (
        <>
          You can look around while we review your application. Your referral link, discount code
          and the Academy open once your account is approved. We will email you at{" "}
          <strong className="font-semibold">{partner.email}</strong>.
        </>
      ),
    },
    suspended: {
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Your Partner account is suspended",
      body: (
        <>
          New attribution and payouts are paused while your account is under review. Existing
          commission records are unchanged. Contact us if you believe this is a mistake.
        </>
      ),
    },
    terminated: {
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Your Partner account is closed",
      body: (
        <>
          Your account is no longer active in the program. Commission records remain visible for
          your reference.
        </>
      ),
    },
  };

  const state = copy[partner.status];
  if (!state) return null;

  return (
    <div className={cx("rounded-2xl border px-5 py-4", state.tone)}>
      <p className="font-display text-sm font-semibold">{state.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed">{state.body}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Commission status                                                          */
/* -------------------------------------------------------------------------- */

const STATUS_TONE: Record<CommissionStatus, "neutral" | "success" | "warning" | "danger" | "cyan"> = {
  PENDING: "warning",
  APPROVED: "cyan",
  PAID: "success",
  REVERSED: "danger",
  REFUNDED: "danger",
  CHARGEBACK: "danger",
};

const STATUS_LABEL: Record<CommissionStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PAID: "Paid",
  REVERSED: "Reversed",
  REFUNDED: "Refunded",
  CHARGEBACK: "Chargeback",
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function CommissionKindLabel({
  kind,
  generation,
}: {
  kind: "direct" | "leadership_override";
  generation: number;
}) {
  if (kind === "direct") return <span>Direct</span>;
  return <span>Override &middot; gen {generation}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Leader qualification progress                                              */
/* -------------------------------------------------------------------------- */

export function QualificationPanel({
  rules,
  activeCustomers,
  activeDirectPartners,
  academyComplete,
  goodStanding,
}: {
  rules: CompensationRules;
  activeCustomers: number;
  activeDirectPartners: number;
  academyComplete: boolean;
  goodStanding: boolean;
}) {
  const q = rules.leaderQualification;
  const checks = [
    {
      label: `${q.minPersonalActiveCustomers} active personally referred customers`,
      met: activeCustomers >= q.minPersonalActiveCustomers,
      progress: `${activeCustomers} of ${q.minPersonalActiveCustomers}`,
    },
    {
      label: `${q.minActiveDirectPartners} active Direct Partner${q.minActiveDirectPartners === 1 ? "" : "s"}`,
      met: activeDirectPartners >= q.minActiveDirectPartners,
      progress: `${activeDirectPartners} of ${q.minActiveDirectPartners}`,
    },
    ...(q.requireAcademyTraining
      ? [
          {
            label: "Academy leadership training",
            met: academyComplete,
            progress: academyComplete ? "Complete" : "Not complete",
          },
        ]
      : []),
    ...(q.requireGoodStanding
      ? [
          {
            label: "Good standing",
            met: goodStanding,
            progress: goodStanding ? "In good standing" : "Under review",
          },
        ]
      : []),
  ];

  const qualified = checks.every((c) => c.met);

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          Leadership qualification
        </h2>
        {qualified ? (
          <Badge tone="gold">Qualified</Badge>
        ) : (
          <Badge tone="neutral">Not yet qualified</Badge>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Qualified Leaders earn a {formatBps(rules.leadership.generationRatesBps[0] ?? 0)} override
        on qualifying customer revenue from their Direct Partners.
      </p>

      <ul className="mt-5 space-y-3">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2.5 text-sm text-[#33405a]">
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold",
                  check.met ? "bg-emerald-50 text-emerald-700" : "bg-navy-50 text-navy-400",
                )}
              >
                {check.met ? "✓" : "–"}
              </span>
              {check.label}
            </span>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
              {check.progress}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-muted">
        <Link href="/leadership" className="underline underline-offset-4">
          How the Leadership Program works
        </Link>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-white px-6 py-12 text-center">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

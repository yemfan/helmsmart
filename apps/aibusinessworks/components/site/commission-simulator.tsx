"use client";

import { useMemo, useState } from "react";
import { simulate } from "@/lib/compensation/simulate";
import { formatBps, formatCents, formatMonthsAsYears } from "@/lib/compensation/format";
import type { CompensationRules } from "@/lib/compensation/types";
import { Disclaimer } from "@/components/ui/disclaimer";
import { cx } from "@/components/ui/primitives";
import { DISCLAIMERS } from "@/lib/site";

/**
 * The commission simulator.
 *
 * It reads the configured plan rules passed down from the server, so it always
 * illustrates the plan that is actually in effect. It is explicitly an
 * illustration: no result here is a payable amount, and the official engine
 * never runs in the browser.
 */
export function CommissionSimulator({
  rules,
  planLabel,
}: {
  rules: CompensationRules;
  planLabel: string;
}) {
  const [monthly, setMonthly] = useState(99);
  const [customers, setCustomers] = useState(1);
  const [retentionMonths, setRetentionMonths] = useState(36);
  const [applyDiscount, setApplyDiscount] = useState(false);

  const result = useMemo(
    () =>
      simulate(rules, {
        monthlyCents: Math.round(monthly * 100),
        customerCount: customers,
        retentionMonths,
        applyCustomerDiscount: applyDiscount,
      }),
    [rules, monthly, customers, retentionMonths, applyDiscount],
  );

  const planMonths = rules.direct.durationMonths;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-card">
      <div className="grid lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* Inputs */}
        <div className="border-b border-hairline bg-canvas-alt p-6 lg:border-b-0 lg:border-r">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">
            Assumptions
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Change any of these. Nothing here is a prediction.
          </p>

          <div className="mt-6 space-y-6">
            <Field
              label="Customer subscription"
              hint="Per month, before any discount"
              value={`$${monthly}`}
            >
              <input
                type="range"
                min={19}
                max={999}
                step={10}
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
                className="w-full accent-navy-700"
                aria-label="Monthly subscription price in dollars"
              />
            </Field>

            <Field label="Customers" hint="Assumed at this price" value={String(customers)}>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={customers}
                onChange={(e) => setCustomers(Number(e.target.value))}
                className="w-full accent-navy-700"
                aria-label="Number of customers"
              />
            </Field>

            <Field
              label="Retention"
              hint={`Plan pays up to ${formatMonthsAsYears(planMonths)}`}
              value={formatMonthsAsYears(retentionMonths)}
            >
              <input
                type="range"
                min={1}
                max={Math.max(planMonths, 48)}
                step={1}
                value={retentionMonths}
                onChange={(e) => setRetentionMonths(Number(e.target.value))}
                className="w-full accent-navy-700"
                aria-label="Months the customer stays subscribed"
              />
            </Field>

            {rules.customerDiscount.defaultDiscountBps > 0 ? (
              <label className="flex items-start gap-3 rounded-xl border border-hairline bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={applyDiscount}
                  onChange={(e) => setApplyDiscount(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-navy-700"
                />
                <span className="text-xs leading-relaxed text-[#33405a]">
                  Apply the {formatBps(rules.customerDiscount.defaultDiscountBps)} customer
                  discount. Commission is calculated on what the customer actually pays.
                </span>
              </label>
            ) : null}
          </div>
        </div>

        {/* Results */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink">
              Illustration
            </h3>
            <span className="text-xs text-muted">
              {planLabel} &middot; qualifying revenue {formatCents(result.qualifyingMonthlyCents)}
              /month
            </span>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            {result.years.map((year) => (
              <div key={year.year} className="rounded-xl border border-hairline bg-canvas-alt p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
                  Year {year.year} &middot; {formatBps(year.rateBps)}
                </dt>
                <dd className="mt-2 font-display text-xl font-semibold tabular-nums text-ink">
                  {formatCents(year.commissionCents)}
                </dd>
                <dd className="mt-1 text-xs text-muted">
                  {year.months} {year.months === 1 ? "month" : "months"} of qualifying revenue
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 rounded-xl border border-navy-200 bg-navy-50 p-5">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-navy-600">
              Direct commission over the illustrated period
            </div>
            <div className="mt-2 font-display text-3xl font-semibold tabular-nums text-navy-900">
              {formatCents(result.totalCents)}
            </div>
            {result.cappedByPlan ? (
              <p className="mt-2 text-xs text-navy-700">
                Retention beyond {formatMonthsAsYears(planMonths)} is shown as zero: the direct
                commission period ends there under this plan.
              </p>
            ) : null}
          </div>

          {result.leadership.rateBps > 0 ? (
            <div className="mt-4 rounded-xl border border-gold-accent/40 bg-gold-soft p-5">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a6122]">
                Leadership illustration &middot; {formatBps(result.leadership.rateBps)} override
              </div>
              <div className="mt-2 font-display text-2xl font-semibold tabular-nums text-[#7a6122]">
                {formatCents(result.leadership.monthlyCents)}
                <span className="ml-1 text-sm font-medium">/month</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#6b5520]">
                What a qualified Leader would see on this same customer revenue if it were
                generated by their Direct Partner - up to{" "}
                {formatMonthsAsYears(result.leadership.durationMonths)} per qualifying customer,
                totalling {formatCents(result.leadership.totalCents)} over the illustrated period.
              </p>
            </div>
          ) : null}

          <div className="mt-6">
            <Disclaimer>{DISCLAIMERS.illustration}</Disclaimer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-navy-600">
          {label}
        </span>
        <span className={cx("font-display text-sm font-semibold tabular-nums text-ink")}>
          {value}
        </span>
      </div>
      <div className="mt-2.5">{children}</div>
      <p className="mt-1.5 text-[0.68rem] text-muted">{hint}</p>
    </div>
  );
}

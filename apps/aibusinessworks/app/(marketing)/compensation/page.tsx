import type { Metadata } from "next";
import { loadProductRules, loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents, formatMonthsAsYears } from "@/lib/compensation/format";
import { PRODUCTS, productByKey } from "@/content/products";
import { Container, Card, Section, SectionHeading } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ClosingCta, InlineLink, PageHero } from "@/components/site/blocks";
import { DirectTotalHeadline, RateStrip } from "@/components/site/rate-strip";
import { CommissionSimulator } from "@/components/site/commission-simulator";
import { DISCLAIMERS } from "@/lib/site";
import type { CompensationRules } from "@/lib/compensation/types";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Compensation Plan",
  description:
    "The AI Business Works Partner Program compensation plan in full: direct commission rates by commission year, the Leadership Override, qualifying revenue, plan versions and effective dates.",
  alternates: { canonical: "/compensation" },
};

interface YearRow {
  year: number;
  rateBps: number;
  window: string;
}

interface ProductRow {
  product: string;
  audience: string;
  years: string;
  override: string;
  duration: string;
}

export default async function CompensationPage() {
  const { rules, version } = await loadPublicRules();
  const productPlans = await loadProductRules();

  const yearCount = Math.ceil(rules.direct.durationMonths / 12);
  const yearRows: YearRow[] = Array.from({ length: yearCount }, (_, i) => ({
    year: i + 1,
    rateBps: rules.direct.yearRatesBps[i] ?? 0,
    window: `Months ${i * 12 + 1} - ${Math.min((i + 1) * 12, rules.direct.durationMonths)} of the customer's subscription`,
  }));

  const yearColumns: Column<YearRow>[] = [
    { key: "year", header: "Commission year", cell: (r) => `Year ${r.year}`, primary: true },
    { key: "window", header: "Applies to", cell: (r) => r.window },
    {
      key: "rate",
      header: "Direct rate",
      align: "right",
      cell: (r) => <strong className="font-semibold">{formatBps(r.rateBps)}</strong>,
    },
  ];

  const productRows: ProductRow[] = productPlans
    .filter((plan) => plan.productId !== null || plan.planKey === "default")
    .map((plan) => {
      const product = plan.productId ? productByKey(plan.productId) : null;
      const yearCountForPlan = Math.ceil(plan.rules.direct.durationMonths / 12);
      return {
        product: product?.name ?? "All products (default plan)",
        audience: product?.audience ?? "Any product without a plan of its own",
        years: plan.rules.direct.yearRatesBps
          .slice(0, yearCountForPlan)
          .map((bps) => formatBps(bps))
          .join(" / "),
        override: formatBps(plan.rules.leadership.generationRatesBps[0] ?? 0),
        duration: formatMonthsAsYears(plan.rules.direct.durationMonths),
      };
    });

  const productColumns: Column<ProductRow>[] = [
    { key: "product", header: "Product", cell: (r) => r.product, primary: true },
    { key: "years", header: "Direct (Y1 / Y2 / Y3)", cell: (r) => r.years },
    { key: "override", header: "Override", align: "right", cell: (r) => r.override },
    { key: "duration", header: "Duration", align: "right", cell: (r) => r.duration },
  ];

  return (
    <>
      <PageHero
        eyebrow="Compensation"
        title="The compensation plan, in full"
        lead="Every rate on this page is read live from the compensation plan currently in effect. If a rate changes, this page changes with it - and the change is recorded in the compensation change history."
      >
        <div className="max-w-4xl">
          <RateStrip rules={rules} tone="dark" />
        </div>
        <div className="mt-8 max-w-3xl">
          <Disclaimer tone="dark">{DISCLAIMERS.hero}</Disclaimer>
        </div>
      </PageHero>

      {/* Direct commission -------------------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Direct commission"
            title="What you earn on the customers you refer"
            lead={`Direct commission runs for up to ${formatMonthsAsYears(rules.direct.durationMonths)} per qualifying customer, counted from that customer's start date.`}
          />

          <div className="mt-10">
            <ResponsiveTable
              columns={yearColumns}
              rows={yearRows}
              rowKey={(r) => String(r.year)}
              caption="Direct commission rate by commission year"
            />
          </div>

          <div className="mt-10">
            <DirectTotalHeadline rules={rules} />
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              That figure is the sum of the published rates across the commission period. It
              describes the structure. What any individual Partner receives depends entirely on
              qualifying revenue from customers who actually subscribe and stay.
            </p>
          </div>

          <div className="mt-8 max-w-3xl">
            <Disclaimer>{DISCLAIMERS.structure}</Disclaimer>
          </div>
        </Container>
      </Section>

      {/* Qualifying revenue -------------------------------------------------- */}
      <Section tone="alt">
        <Container>
          <SectionHeading
            eyebrow="The base"
            title="What counts as qualifying revenue"
            lead="Commission is a percentage of qualifying revenue, not of list price. The current plan defines it as follows."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                Included
              </h3>
              <ul className="mt-4 space-y-2.5">
                {rules.qualifyingRevenue.eligibleEventTypes.map((type) => (
                  <li key={type} className="flex gap-2.5 text-sm leading-relaxed text-[#33405a]">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {EVENT_LABELS[type] ?? type}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                Excluded or reversed
              </h3>
              <ul className="mt-4 space-y-2.5">
                {exclusionList(rules).map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[#33405a]">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
            Which revenue types qualify is an administrator setting, not a fixed rule of the
            platform. The list above reflects the plan in effect right now.
          </p>
        </Container>
      </Section>

      {/* Leadership override -------------------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Leadership Override"
            title={`${formatBps(rules.leadership.generationRatesBps[0] ?? 0)} on your Direct Partners' customer revenue`}
            lead={`Paid to qualified Leaders on qualifying customer revenue generated by the Partners they personally developed, across ${rules.leadership.maxGenerations === 1 ? "one generation" : `${rules.leadership.maxGenerations} generations`}, for up to ${formatMonthsAsYears(rules.leadership.durationMonths)} per qualifying customer.`}
          />
          <div className="mt-8">
            <InlineLink href="/leadership">See the full Leadership Program</InlineLink>
          </div>
        </Container>
      </Section>

      {/* Product plans -------------------------------------------------- */}
      <Section tone="alt">
        <Container>
          <SectionHeading
            eyebrow="By product"
            title="Compensation can differ by product"
            lead="Each product can carry its own plan. Today they follow the default plan; the platform does not assume they always will."
          />
          <div className="mt-10">
            <ResponsiveTable
              columns={productColumns}
              rows={productRows}
              rowKey={(r) => r.product}
              caption="Compensation plan by product"
            />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Products in the ecosystem today:{" "}
            {PRODUCTS.map((p) => p.name).join(", ")}. Future products may launch with different
            rates, durations, qualification rules or eligible revenue types.
          </p>
        </Container>
      </Section>

      {/* Versions and effective dates -------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Plan versions"
            title="Your plan does not change under you"
            lead="Compensation plans are versioned with effective dates. Every commission ever calculated records the exact version it was priced under."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Versioned</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                A change to the plan creates a new version with its own effective date. The old
                version is not edited.
              </p>
            </Card>
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Grandfathered</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Under the default transition policy, a customer stays on the version in effect when
                they subscribed - for their whole commission period.
              </p>
            </Card>
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Never recalculated</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Historical commissions are never re-priced under a newer plan. A correction is
                posted as its own reversal entry, never as an edit.
              </p>
            </Card>
          </div>

          {version ? (
            <div className="mt-10 rounded-2xl border border-hairline bg-canvas-alt p-6">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Plan in effect
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-ink">
                {version.label}
              </p>
              <p className="mt-1 text-sm text-muted">
                Effective from {version.effectiveFrom}
                {version.effectiveUntil ? ` until ${version.effectiveUntil}` : " (open-ended)"}.
                New customers are priced under this version; existing customers stay on the version
                in effect when they subscribed.
              </p>
            </div>
          ) : null}
        </Container>
      </Section>

      {/* Simulator -------------------------------------------------- */}
      <Section tone="alt" id="simulator">
        <Container width="wide">
          <SectionHeading
            eyebrow="Simulator"
            title="Work through the arithmetic yourself"
            lead="Set the assumptions and see how the structure applies to them. This is a calculator, not a forecast - it reads the live plan rates and applies them to numbers you choose."
          />
          <div className="mt-10">
            <CommissionSimulator rules={rules} planLabel={version?.label ?? "Current plan"} />
          </div>

          <div className="mt-8 rounded-2xl border border-hairline bg-white p-6 shadow-card">
            <h3 className="font-display text-base font-semibold text-ink">
              A worked example, in words
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A customer subscribes at {formatCents(9900)} per month and stays{" "}
              {formatMonthsAsYears(rules.direct.durationMonths)}. In commission year one the
              Partner would receive {formatBps(rules.direct.yearRatesBps[0] ?? 0)} of that
              qualifying revenue, which is{" "}
              {formatCents(Math.round((9900 * (rules.direct.yearRatesBps[0] ?? 0)) / 10_000))} per
              month. In year two the rate steps to{" "}
              {formatBps(rules.direct.yearRatesBps[1] ?? 0)}, and in year three to{" "}
              {formatBps(rules.direct.yearRatesBps[2] ?? 0)}. A qualified Leader whose Direct
              Partner referred that customer would separately see{" "}
              {formatBps(rules.leadership.generationRatesBps[0] ?? 0)} of the same qualifying
              revenue, which is{" "}
              {formatCents(
                Math.round((9900 * (rules.leadership.generationRatesBps[0] ?? 0)) / 10_000),
              )}{" "}
              per month.
            </p>
            <div className="mt-5">
              <Disclaimer>{DISCLAIMERS.illustration}</Disclaimer>
            </div>
          </div>
        </Container>
      </Section>

      <ClosingCta rates={<RateStrip rules={rules} tone="dark" />} />
    </>
  );
}

const EVENT_LABELS: Record<string, string> = {
  new_subscription: "New subscriptions",
  renewal: "Renewals",
  upgrade: "Upgrades",
  add_on: "Add-ons",
  expansion: "Expansion revenue",
  one_time: "One-time charges",
};

function exclusionList(rules: CompensationRules): string[] {
  const q = rules.qualifyingRevenue;
  const items: string[] = [];
  if (q.excludeTaxes) items.push("Taxes");
  if (q.commissionOnNetOfDiscount)
    items.push("The discounted portion (commission is on what the customer actually pays)");
  if (q.excludeCredits) items.push("Account credits applied to the invoice");
  if (q.reverseOnRefund) items.push("Refunded amounts (commission is reversed)");
  if (q.reverseOnChargeback) items.push("Charged-back amounts (commission is reversed)");
  const notEligible = (["one_time"] as const).filter(
    (t) => !q.eligibleEventTypes.includes(t),
  );
  for (const t of notEligible) items.push(`${EVENT_LABELS[t]} (not commissionable)`);
  if (q.minimumQualifyingRevenueCents > 0) {
    items.push(
      `Invoices under ${formatCents(q.minimumQualifyingRevenueCents)} in qualifying revenue`,
    );
  }
  return items;
}

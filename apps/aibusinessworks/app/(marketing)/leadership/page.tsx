import type { Metadata } from "next";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatCents, formatMonthsAsYears } from "@/lib/compensation/format";
import { Card, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { ResponsiveTable, type Column } from "@/components/ui/table";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ClosingCta, InlineLink, PageHero } from "@/components/site/blocks";
import { GenerationDiagram } from "@/components/site/visuals";
import { RateTile } from "@/components/ui/stat";
import { DISCLAIMERS } from "@/lib/site";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Leadership Program",
  description:
    "How AI Business Works Partners qualify as Leaders, what the Leadership Override pays, how long it lasts, and why it covers a single generation.",
  alternates: { canonical: "/leadership" },
};

interface DurationRow {
  year: string;
  status: string;
  rate: string;
}

export default async function LeadershipPage() {
  const { rules } = await loadPublicRules();
  const overrideBps = rules.leadership.generationRatesBps[0] ?? 0;
  const overrideYears = Math.ceil(rules.leadership.durationMonths / 12);
  const q = rules.leaderQualification;

  const durationRows: DurationRow[] = [
    ...Array.from({ length: overrideYears }, (_, i) => ({
      year: `Year ${i + 1}`,
      status: "Within the override window",
      rate: formatBps(rules.leadership.generationRatesBps[0] ?? 0),
    })),
    {
      year: `Year ${overrideYears + 1}`,
      status: "Override window has ended",
      rate: "No override under the default plan",
    },
  ];

  const durationColumns: Column<DurationRow>[] = [
    { key: "year", header: "Customer year", cell: (r) => r.year, primary: true },
    { key: "status", header: "Status", cell: (r) => r.status },
    { key: "rate", header: "Override", align: "right", cell: (r) => r.rate },
  ];

  const exampleMonthly = 9900;
  const exampleOverride = Math.round((exampleMonthly * overrideBps) / 10_000);

  return (
    <>
      <PageHero
        eyebrow="Leadership"
        title="Build more than a customer base"
        lead="Partners who demonstrate real customer success can become AI Business Works Leaders. The Leadership Override rewards developing Partners who go on to serve customers - not the act of recruiting."
      >
        <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
          <RateTile
            tone="dark"
            emphasis
            value={formatBps(overrideBps)}
            label="Leadership Override"
          />
          <RateTile
            tone="dark"
            value={String(rules.leadership.maxGenerations)}
            label={rules.leadership.maxGenerations === 1 ? "Generation" : "Generations"}
          />
          <RateTile
            tone="dark"
            value={formatMonthsAsYears(rules.leadership.durationMonths)}
            label="Per qualifying customer"
          />
        </div>
      </PageHero>

      {/* Qualification -------------------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Qualification"
            title="What it takes to become a Leader"
            lead="These are the requirements set by the compensation plan currently in effect. An administrator can change them, and any change is recorded in the compensation change history."
          />

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QualificationCard
              value={String(q.minPersonalActiveCustomers)}
              label="Personally referred active paying customers"
              detail="Customers you introduced yourself, currently active and paying."
            />
            <QualificationCard
              value={String(q.minActiveDirectPartners)}
              label={`Active Direct Partner${q.minActiveDirectPartners === 1 ? "" : "s"}`}
              detail="A Partner you personally developed, with an active account."
            />
            <QualificationCard
              value={q.requireAcademyTraining ? "Required" : "Recommended"}
              label="Academy leadership training"
              detail="The Partner Leadership and Compliance courses in the Academy."
              small
            />
            <QualificationCard
              value={q.requireGoodStanding ? "Required" : "Not required"}
              label="Good standing and compliance"
              detail="No unresolved breaches of the Partner Program Terms or Marketing Guidelines."
              small
            />
          </div>

          <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted">
            Leader status is reviewed on an ongoing basis. A Partner who stops meeting the
            requirements stops earning the override for the periods in which they were not
            qualified. Your live qualification status is shown in your Partner dashboard.
          </p>
        </Container>
      </Section>

      {/* What it pays -------------------------------------------------- */}
      <Section tone="navy" grid>
        <Container>
          <SectionHeading
            tone="dark"
            eyebrow="The override"
            title="What the Leadership Override pays"
            lead={`A qualified Leader can earn ${formatBps(overrideBps)} of qualifying customer subscription revenue generated by a Partner they personally developed.`}
          />

          <div className="mt-10 rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-8">
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cyan-accent">
              Worked example
            </div>
            <div className="mt-4 space-y-2 text-base leading-relaxed text-navy-200">
              <p>Sarah developed David. David referred a customer paying {formatCents(exampleMonthly)} per month.</p>
              <p>David receives his direct commission on that customer.</p>
              <p className="text-white">
                Sarah receives {formatCents(exampleMonthly)} &times; {formatBps(overrideBps)} ={" "}
                <strong className="font-semibold">{formatCents(exampleOverride)}</strong> per month,
                subject to qualifying revenue rules.
              </p>
            </div>
            <div className="mt-6">
              <Disclaimer tone="dark">{DISCLAIMERS.illustration}</Disclaimer>
            </div>
          </div>

          <p className="mt-8 max-w-3xl text-base leading-relaxed text-navy-200">
            The override is calculated on the same qualifying revenue as the direct commission -
            net of the customer&apos;s discount, excluding taxes and credits, and reversed when the
            underlying revenue is refunded or charged back.
          </p>
        </Container>
      </Section>

      {/* Duration -------------------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Duration"
            title={`Up to ${formatMonthsAsYears(rules.leadership.durationMonths)} per qualifying customer`}
            lead="The override window is counted per customer, from that customer's start date - not from the date the Leader qualified."
          />
          <div className="mt-10">
            <ResponsiveTable
              columns={durationColumns}
              rows={durationRows}
              rowKey={(r) => r.year}
              caption="Leadership Override by customer year"
            />
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
            If a customer remains active beyond the override window, the Direct Partner&apos;s and
            the Leader&apos;s entitlements each end according to their own rules in the plan
            version that customer is priced under. Transition rules for a future plan version are
            set explicitly by an administrator, never applied silently.
          </p>
        </Container>
      </Section>

      {/* One generation -------------------------------------------------- */}
      <Section tone="alt" id="generations">
        <Container width="wide">
          <SectionHeading
            eyebrow="Scope"
            title="One level. Simple. Transparent."
            lead={
              rules.leadership.maxGenerations === 1
                ? "The default plan pays a single generation of Leadership Override. There is no second level, and no depth to chase."
                : `The current plan pays ${rules.leadership.maxGenerations} generations of Leadership Override.`
            }
          />
          <div className="mt-10">
            <GenerationDiagram overrideLabel={formatBps(overrideBps)} />
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
            The generation limit is a plan setting. If AI Business Works ever changes it, the change
            creates a new plan version with its own effective date and an explicit transition rule.{" "}
            <InlineLink href="/compensation">See how plan versions work</InlineLink>.
          </p>
        </Container>
      </Section>

      {/* Responsibility -------------------------------------------------- */}
      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Responsibility"
            title="What Leaders are actually for"
            lead="The override exists because developing a Partner well takes real work, and because that work should keep paying attention to customers."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Train, do not recruit</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                A Direct Partner who never serves a customer produces no override. Leadership is
                measured by what your Partners deliver, not by how many you sign.
              </p>
            </Card>
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Set the standard</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Leaders are held to the Marketing Guidelines for their own promotion and for what
                their Partners publish. Income claims by a Partner are a Leadership problem.
              </p>
            </Card>
            <Card>
              <h3 className="font-display text-base font-semibold text-ink">Stay accountable</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Qualification is checked continuously against live customer and Partner counts,
                visible to you and to AI Business Works.
              </p>
            </Card>
          </div>
        </Container>
      </Section>

      <ClosingCta
        headline="Start with customers. Leadership follows."
        sub="Every Leader began by helping one business adopt AI. Become a Partner and start there."
      />
    </>
  );
}

function QualificationCard({
  value,
  label,
  detail,
  small = false,
}: {
  value: string;
  label: string;
  detail: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-card">
      <div
        className={
          small
            ? "font-display text-xl font-semibold tracking-tight text-navy-900"
            : "font-display text-4xl font-semibold tracking-tight text-navy-900"
        }
      >
        {value}
      </div>
      <div className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        {label}
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

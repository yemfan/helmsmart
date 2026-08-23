import type { Metadata } from "next";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatMonthsAsYears } from "@/lib/compensation/format";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { ClosingCta, FeatureGrid, InlineLink, PageHero, StepList } from "@/components/site/blocks";
import { FlowDiagram } from "@/components/site/visuals";
import { Disclaimer } from "@/components/ui/disclaimer";
import { RateStrip } from "@/components/site/rate-strip";
import { DISCLAIMERS } from "@/lib/site";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "How the AI Business Works Partner Program Works",
  description:
    "Join, learn the products, connect businesses with the right AI solution, and earn qualifying commissions. A step-by-step explanation of the AI Business Works Partner Program.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS = [
  { title: "Join", body: "Register as a Partner. Free, no inventory, no purchase requirement, no monthly minimum." },
  { title: "Learn", body: "Work through the Academy until you can explain each product and recognise the businesses it fits." },
  { title: "Connect", body: "Introduce a business to the right solution using your link, code or QR code." },
  { title: "Earn", body: "When a referred customer subscribes and pays, qualifying commission posts to your ledger." },
  { title: "Grow", body: "Meet the requirements, develop Direct Partners, and qualify for the Leadership Override." },
];

const WHAT_YOU_DO = [
  {
    title: "You introduce",
    body: "You find the businesses, understand the problem, and show the product that addresses it. That is the work the program pays for.",
  },
  {
    title: "AI Business Works delivers",
    body: "Contracting, billing, support, product and delivery sit with AI Business Works. You are not reselling and you do not carry the service.",
  },
  {
    title: "The platform tracks",
    body: "Attribution, qualifying revenue and every commission calculation are recorded by the platform and visible in your dashboard.",
  },
];

const WHAT_YOU_GET = [
  { title: "A personal referral link", body: "Every visit through it is recorded against you." },
  { title: "A personal discount code", body: "Your customers get the applicable promotional offer." },
  { title: "A QR code", body: "For print, events and in-person conversations." },
  { title: "A Partner landing page", body: "A public profile businesses can be sent to." },
  { title: "The Academy", body: "Product training, sales training and the leadership track." },
  { title: "The resource library", body: "Decks, demos, templates, comparisons and brand assets." },
];

export default async function HowItWorksPage() {
  const { rules, version } = await loadPublicRules();

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From an introduction to a recurring commission"
        lead="The program has one economic engine: a business you introduced becomes a paying customer and stays one. Everything below follows from that."
      />

      <Section tone="light">
        <Container width="wide">
          <SectionHeading eyebrow="The five steps" title="What a Partner actually does" />
          <div className="mt-12">
            <StepList steps={STEPS} />
          </div>
        </Container>
      </Section>

      <Section tone="alt">
        <Container>
          <SectionHeading
            eyebrow="Division of work"
            title="What is yours, and what is ours"
            lead="A Partner is an independent contractor who introduces and supports. Everything after the sale belongs to AI Business Works."
          />
          <div className="mt-12">
            <FeatureGrid items={WHAT_YOU_DO} />
          </div>
        </Container>
      </Section>

      <Section tone="light">
        <Container>
          <SectionHeading
            eyebrow="Attribution"
            title="How a customer becomes your customer"
            lead="Attribution is recorded at the moment of subscription, from the code or link the customer arrived with. The record stores which code, which visit and which subscription produced it, so it can be audited later."
          />
          <div className="mt-12">
            <FlowDiagram
              steps={[
                { label: "Your link or code", detail: "Shared by you" },
                { label: "Visit recorded", detail: "Attribution captured" },
                { label: "Customer subscribes", detail: "Discount applied", emphasis: true },
                { label: "Revenue recorded", detail: "Actual billed amount" },
                { label: "Commission calculated", detail: "By the server engine", emphasis: true },
              ]}
            />
          </div>
          <p className="mt-10 max-w-3xl text-base leading-relaxed text-muted">
            An existing AI Business Works customer is not re-attributed. Where two Partners have a
            competing claim, attribution is resolved from the platform record, not from who asks
            first. See the <InlineLink href="/terms">Partner Program Terms</InlineLink>.
          </p>
        </Container>
      </Section>

      <Section tone="navy" grid>
        <Container>
          <SectionHeading
            tone="dark"
            eyebrow="What you earn"
            title="The commission structure at a glance"
            lead={`Direct commission runs for up to ${formatMonthsAsYears(rules.direct.durationMonths)} from the customer's start date, at a rate that steps down each commission year.`}
          />
          <div className="mt-12 max-w-4xl">
            <RateStrip rules={rules} tone="dark" />
          </div>
          <p className="mt-8 max-w-3xl text-base leading-relaxed text-navy-200">
            The commission clock starts on the customer&apos;s start date, not on the date you
            joined. Year one pays {formatBps(rules.direct.yearRatesBps[0] ?? 0)} of qualifying
            revenue for the first twelve months of that customer&apos;s subscription.
          </p>
          <div className="mt-10 max-w-3xl">
            <Disclaimer tone="dark">{DISCLAIMERS.structure}</Disclaimer>
          </div>
        </Container>
      </Section>

      <Section tone="light">
        <Container width="wide">
          <SectionHeading
            eyebrow="What you get"
            title="Everything a Partner starts with"
            lead="Provided on the day your account is approved."
          />
          <div className="mt-12">
            <FeatureGrid items={WHAT_YOU_GET} />
          </div>
        </Container>
      </Section>

      <Section tone="alt">
        <Container width="narrow">
          <SectionHeading
            eyebrow="Transparency"
            title="Every commission is explainable"
            lead="The platform stores the plan version, the rate, the qualifying revenue and the full calculation trace for every entry in your ledger. You can always ask why a number is what it is - and get an answer from the record, not an opinion."
          />
          {version ? (
            <p className="mt-8 text-sm text-muted">
              Current plan: <strong className="font-semibold text-ink">{version.label}</strong>,
              effective from {version.effectiveFrom}
              {version.effectiveUntil ? ` until ${version.effectiveUntil}` : ""}.{" "}
              <InlineLink href="/compensation">See the full compensation plan</InlineLink>.
            </p>
          ) : null}
        </Container>
      </Section>

      <ClosingCta />
    </>
  );
}

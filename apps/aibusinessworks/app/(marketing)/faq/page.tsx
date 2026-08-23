import type { Metadata } from "next";
import { FAQ_SECTIONS } from "@/content/faq";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatMonthsAsYears } from "@/lib/compensation/format";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ClosingCta, PageHero } from "@/components/site/blocks";
import { RateStrip } from "@/components/site/rate-strip";
import { DISCLAIMERS, SITE } from "@/lib/site";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about the AI Business Works Partner Program: how commissions work, what qualifying revenue means, how the Leadership Override works, customer attribution, and what Partners may and may not claim.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const { rules } = await loadPublicRules();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_SECTIONS.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
      })),
    ),
  };

  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Questions people actually ask"
        lead="If something here is unclear, that is a problem worth fixing - tell us and we will rewrite the answer."
      >
        <div className="max-w-3xl">
          <RateStrip rules={rules} tone="dark" />
        </div>
      </PageHero>

      {/* The live numbers, stated once, plainly. */}
      <Section tone="light" size="tight">
        <Container>
          <SectionHeading
            eyebrow="The current plan"
            title="The numbers, as configured today"
            lead="These come from the compensation plan in effect right now, not from copy written months ago."
          />
          <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              term="Direct commission"
              detail={rules.direct.yearRatesBps
                .slice(0, Math.ceil(rules.direct.durationMonths / 12))
                .map((bps, i) => `Year ${i + 1}: ${formatBps(bps)}`)
                .join(" - ")}
            />
            <Fact
              term="Direct commission period"
              detail={`${formatMonthsAsYears(rules.direct.durationMonths)} per qualifying customer`}
            />
            <Fact
              term="Leadership Override"
              detail={`${formatBps(rules.leadership.generationRatesBps[0] ?? 0)} across ${rules.leadership.maxGenerations === 1 ? "one generation" : `${rules.leadership.maxGenerations} generations`}, up to ${formatMonthsAsYears(rules.leadership.durationMonths)} per qualifying customer`}
            />
            <Fact
              term="Leader qualification"
              detail={`${rules.leaderQualification.minPersonalActiveCustomers} active personal customers, ${rules.leaderQualification.minActiveDirectPartners} active Direct Partner${rules.leaderQualification.minActiveDirectPartners === 1 ? "" : "s"}${rules.leaderQualification.requireAcademyTraining ? ", required Academy training" : ""}`}
            />
          </dl>
        </Container>
      </Section>

      {FAQ_SECTIONS.map((section, index) => (
        <Section
          key={section.id}
          id={section.id}
          tone={index % 2 === 0 ? "alt" : "light"}
          className="scroll-mt-20"
        >
          <Container width="narrow">
            <SectionHeading eyebrow={`${index + 1}`.padStart(2, "0")} title={section.title} />
            <dl className="mt-10 divide-y divide-hairline border-t border-hairline">
              {section.items.map((item) => (
                <div key={item.id} id={item.id} className="scroll-mt-24 py-7">
                  <dt className="font-display text-lg font-semibold tracking-tight text-ink">
                    {item.question}
                  </dt>
                  <dd className="mt-3 space-y-3">
                    {item.answer.map((paragraph, i) => (
                      <p key={i} className="text-[15px] leading-relaxed text-muted">
                        {paragraph}
                      </p>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>

            {section.id === "earnings" ? (
              <div className="mt-8">
                <Disclaimer>{DISCLAIMERS.illustration}</Disclaimer>
              </div>
            ) : null}
          </Container>
        </Section>
      ))}

      <Section tone="light" size="tight">
        <Container width="narrow">
          <p className="text-sm leading-relaxed text-muted">
            Still have a question? Write to{" "}
            <a
              href={`mailto:${SITE.contactEmail}`}
              className="font-medium text-navy-700 underline underline-offset-4"
            >
              {SITE.contactEmail}
            </a>
            .
          </p>
        </Container>
      </Section>

      <ClosingCta />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-card">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        {term}
      </dt>
      <dd className="mt-2.5 text-sm leading-relaxed text-ink">{detail}</dd>
    </div>
  );
}

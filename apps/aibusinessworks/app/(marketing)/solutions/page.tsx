import type { Metadata } from "next";
import { PRODUCTS } from "@/content/products";
import { Container, Section, SectionHeading, cx } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ClosingCta, PageHero } from "@/components/site/blocks";
import { EcosystemDiagram } from "@/components/site/visuals";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "AI Solutions",
  description:
    "The AI Business Works product ecosystem: CloseBoss AI for real estate sales, MarketingBoss AI for business marketing, and HelmSmart AI as the AI business operating platform.",
  alternates: { canonical: "/solutions" },
};

const ACCENT_BAR = {
  cyan: "bg-cyan-accent",
  gold: "bg-gold-accent",
  navy: "bg-navy-600",
} as const;

const ACCENT_TEXT = {
  cyan: "text-[#12657c]",
  gold: "text-[#7a6122]",
  navy: "text-navy-600",
} as const;

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="One Partner. Multiple AI solutions."
        lead={`${SITE.name} is broader than any one product. A Partner recommends the solution that fits the business in front of them, and the ecosystem is built so new products can join without changing how the Partner works.`}
      />

      {PRODUCTS.map((product, index) => (
        <Section
          key={product.key}
          id={product.key}
          tone={index % 2 === 0 ? "light" : "alt"}
          className="scroll-mt-20"
        >
          <Container width="wide">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
              <div>
                <div
                  className={cx("h-1 w-16 rounded-full", ACCENT_BAR[product.accent])}
                  aria-hidden="true"
                />
                <p className="mt-6 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-navy-500">
                  {product.category}
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {product.name}
                </h2>
                <p className={cx("mt-3 text-lg font-medium", ACCENT_TEXT[product.accent])}>
                  {product.tagline}
                </p>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
                  {product.summary}
                </p>

                <h3 className="mt-10 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                  What a Partner helps a customer do
                </h3>
                <ul className="mt-4 space-y-3">
                  {product.helps.map((help) => (
                    <li
                      key={help}
                      className="flex gap-3 text-[15px] leading-relaxed text-[#33405a]"
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                          ACCENT_BAR[product.accent],
                        )}
                      />
                      {help}
                    </li>
                  ))}
                </ul>

                <div className="mt-9 flex flex-wrap gap-3">
                  <ButtonLink href={product.siteUrl} variant="primary" external>
                    {product.cta}
                  </ButtonLink>
                  <ButtonLink href="/academy" variant="secondary">
                    Product training
                  </ButtonLink>
                </div>
              </div>

              <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card sm:p-7">
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                  Who it is for
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink">{product.audience}</p>

                <div className="mt-8 space-y-5 border-t border-hairline pt-6">
                  {product.proofPoints.map((point) => (
                    <div key={point.label}>
                      <div
                        className={cx(
                          "text-[0.7rem] font-semibold uppercase tracking-[0.12em]",
                          ACCENT_TEXT[product.accent],
                        )}
                      >
                        {point.label}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">{point.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </Section>
      ))}

      <Section tone="dark" grid>
        <Container width="wide">
          <SectionHeading
            tone="dark"
            eyebrow="The ecosystem"
            title="Where the products sit"
            lead="AI Business Works is the master brand. Products are one branch of it, and the Partner Program is the human distribution network that brings them to market."
          />
          <div className="mt-12">
            <EcosystemDiagram />
          </div>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-navy-300">
            Because the platform supports product-specific compensation plans, a future product can
            launch with its own rates, durations and qualification rules without disturbing the
            plans your existing customers are priced under.
          </p>
        </Container>
      </Section>

      <ClosingCta
        headline="One relationship. Three products. More coming."
        sub="Learn the products, find the fit, and make the introduction."
      />
    </>
  );
}

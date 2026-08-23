import type { Metadata } from "next";
import { RESOURCES, RESOURCE_CATEGORIES } from "@/content/resources";
import { productByKey } from "@/content/products";
import { Badge, Card, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ClosingCta, PageHero } from "@/components/site/blocks";

export const metadata: Metadata = {
  title: "Partner Resources",
  description:
    "The AI Business Works Partner toolkit: sales decks, product demos, comparison sheets, email and SMS templates, social posts, video scripts, brochures, brand assets and your personal referral links.",
  alternates: { canonical: "/resources" },
};

const FORMAT_LABEL: Record<string, string> = {
  deck: "Deck",
  document: "Document",
  template: "Templates",
  graphics: "Graphics",
  video: "Video",
  tool: "Tool",
};

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="The Partner toolkit"
        lead="Everything you need for the conversation, the follow-up and the demo. Materials are brand-correct and written to the Marketing Guidelines, so using them keeps you compliant by default."
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/login" variant="onDark">
            Log in to download
          </ButtonLink>
          <ButtonLink
            href="/join"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            Become a Partner
          </ButtonLink>
        </div>
      </PageHero>

      {RESOURCE_CATEGORIES.map((category, index) => {
        const items = RESOURCES.filter((r) => r.category === category.key);
        if (!items.length) return null;
        return (
          <Section key={category.key} tone={index % 2 === 0 ? "light" : "alt"}>
            <Container width="wide">
              <SectionHeading eyebrow={category.name} title={category.detail} />
              <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const product = item.productKey ? productByKey(item.productKey) : null;
                  return (
                    <li key={item.key}>
                      <Card className="flex h-full flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{FORMAT_LABEL[item.format] ?? item.format}</Badge>
                          {product ? <Badge tone="cyan">{product.name}</Badge> : null}
                          {item.isPartnerOnly ? null : <Badge tone="success">Public</Badge>}
                        </div>
                        <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-ink">
                          {item.title}
                        </h3>
                        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                          {item.description}
                        </p>
                        <p className="mt-5 text-xs font-medium text-navy-500">
                          {item.isPartnerOnly ? "Available in your Partner dashboard" : "Open to everyone"}
                        </p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </Container>
          </Section>
        );
      })}

      <Section tone="light">
        <Container width="narrow">
          <SectionHeading
            eyebrow="Before you publish"
            title="Using these materials keeps you inside the rules"
            lead="The templates deliberately contain no income claims, no guarantees and no earnings figures. If you write your own material, the Partner Marketing Guidelines apply to it exactly as they apply to ours."
          />
          <div className="mt-8">
            <ButtonLink href="/marketing-guidelines" variant="secondary">
              Read the Marketing Guidelines
            </ButtonLink>
          </div>
        </Container>
      </Section>

      <ClosingCta
        headline="Open the toolkit"
        sub="Register as a Partner to download the decks, demos, templates and your personal links."
      />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { listPublicPartners } from "@/lib/partners";
import { productByKey } from "@/content/products";
import { Badge, Card, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ClosingCta, PageHero } from "@/components/site/blocks";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Partner Directory",
  description:
    "Find an AI Business Works Partner: independent professionals who help businesses adopt CloseBoss AI, MarketingBoss AI and HelmSmart AI.",
  alternates: { canonical: "/partners" },
};

export default async function PartnersPage() {
  const partners = await listPublicPartners();

  return (
    <>
      <PageHero
        eyebrow="Directory"
        title="Find an AI Business Works Partner"
        lead="Independent professionals who help businesses adopt AI. Partners appear here once their account is active and they have chosen to publish a profile."
      />

      <Section tone="light">
        <Container width="wide">
          {partners.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-canvas-alt p-8 text-center sm:p-12">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                No published profiles yet
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
                The directory lists Partners who have chosen to publish a public profile. As the
                program opens, they will appear here.
              </p>
              <div className="mt-7">
                <ButtonLink href="/join" variant="primary">
                  Become a Partner
                </ButtonLink>
              </div>
            </div>
          ) : (
            <>
              <SectionHeading
                eyebrow={`${partners.length} ${partners.length === 1 ? "Partner" : "Partners"}`}
                title="Published profiles"
              />
              <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {partners.map((partner) => (
                  <li key={partner.slug}>
                    <Card className="flex h-full flex-col" interactive>
                      <div className="flex items-center gap-3">
                        {partner.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={partner.photoUrl}
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 font-display text-base font-semibold text-navy-700">
                            {partner.name.charAt(0)}
                          </span>
                        )}
                        <div>
                          <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                            {partner.name}
                          </h3>
                          {partner.location ? (
                            <p className="text-xs text-muted">{partner.location}</p>
                          ) : null}
                        </div>
                      </div>

                      {partner.headline ? (
                        <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
                          {partner.headline}
                        </p>
                      ) : null}

                      {partner.productKeys.length ? (
                        <div className="mt-5 flex flex-wrap gap-1.5">
                          {partner.productKeys.map((key) => (
                            <Badge key={key} tone="cyan">
                              {productByKey(key)?.name ?? key}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-6">
                        <Link
                          href={`/partners/${partner.slug}`}
                          className="text-sm font-semibold text-navy-700 underline underline-offset-4 hover:text-navy-900"
                        >
                          View profile
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Container>
      </Section>

      <ClosingCta
        headline="Want your own Partner profile?"
        sub="Register, complete the Academy, and publish a profile businesses can find."
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPartner } from "@/lib/partners";
import { productByKey } from "@/content/products";
import { PARTNER_LEVELS } from "@/content/levels";
import { Badge, Card, Container, Section } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { SITE } from "@/lib/site";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const partner = await getPublicPartner(slug);
  if (!partner) return { title: "Partner not found", robots: { index: false, follow: false } };

  const description =
    partner.headline ??
    `${partner.name} is an independent AI Business Works Partner helping businesses adopt AI.`;

  return {
    title: `${partner.name} - AI Business Works Partner`,
    description,
    alternates: { canonical: `/partners/${slug}` },
    openGraph: {
      type: "profile",
      title: `${partner.name} - AI Business Works Partner`,
      description,
      images: partner.photoUrl ? [partner.photoUrl] : undefined,
    },
  };
}

export default async function PartnerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const partner = await getPublicPartner(slug);
  if (!partner) notFound();

  const level = PARTNER_LEVELS.find((l) => l.key === partner.levelKey);
  const socials = Object.entries(partner.socialLinks).filter(([, url]) => Boolean(url));

  return (
    <>
      <Section tone="dark" grid size="tight" className="pt-16 sm:pt-20">
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {partner.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={partner.photoUrl}
                alt=""
                className="h-24 w-24 shrink-0 rounded-2xl object-cover ring-1 ring-white/15"
              />
            ) : (
              <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] font-display text-3xl font-semibold text-white ring-1 ring-white/15">
                {partner.name.charAt(0)}
              </span>
            )}
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-cyan-accent">
                AI Business Works Partner
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {partner.name}
              </h1>
              {partner.location ? (
                <p className="mt-2 text-sm text-navy-300">{partner.location}</p>
              ) : null}
              {level ? (
                <p className="mt-3">
                  <Badge tone={level.requiresLeaderQualification ? "gold" : "cyan"}>
                    {level.name}
                  </Badge>
                </p>
              ) : null}
            </div>
          </div>

          {partner.headline ? (
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-navy-200">
              {partner.headline}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            {partner.bookingUrl ? (
              <ButtonLink href={partner.bookingUrl} variant="onDark" external>
                Book a demo
              </ButtonLink>
            ) : null}
            {partner.contactEmail ? (
              <ButtonLink
                href={`mailto:${partner.contactEmail}`}
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
              >
                Contact {partner.name.split(" ")[0]}
              </ButtonLink>
            ) : null}
          </div>
        </Container>
      </Section>

      <Section tone="light">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {partner.bio ? (
                <>
                  <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                    About
                  </h2>
                  <div className="mt-4 space-y-4">
                    {partner.bio.split(/\n{2,}/).map((paragraph, i) => (
                      <p key={i} className="text-[15px] leading-relaxed text-muted">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </>
              ) : null}

              {partner.productKeys.length ? (
                <>
                  <h2 className="mt-12 font-display text-xl font-semibold tracking-tight text-ink">
                    Products
                  </h2>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {partner.productKeys.map((key) => {
                      const product = productByKey(key);
                      if (!product) return null;
                      return (
                        <li key={key}>
                          <Card>
                            <h3 className="font-display text-base font-semibold text-ink">
                              {product.name}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {product.tagline}
                            </p>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>

            <aside className="space-y-6">
              {partner.industries.length ? (
                <Card>
                  <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    Industries
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {partner.industries.map((industry) => (
                      <Badge key={industry}>{industry}</Badge>
                    ))}
                  </div>
                </Card>
              ) : null}

              {partner.languages.length ? (
                <Card>
                  <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    Languages
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {partner.languages.map((language) => (
                      <Badge key={language}>{language}</Badge>
                    ))}
                  </div>
                </Card>
              ) : null}

              {partner.websiteUrl || socials.length ? (
                <Card>
                  <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    Elsewhere
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {partner.websiteUrl ? (
                      <li>
                        <a
                          href={partner.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-sm font-medium text-navy-700 underline underline-offset-4"
                        >
                          Website
                        </a>
                      </li>
                    ) : null}
                    {socials.map(([name, url]) => (
                      <li key={name}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-sm font-medium capitalize text-navy-700 underline underline-offset-4"
                        >
                          {name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </aside>
          </div>

          <div className="mt-12">
            <Disclaimer>
              {partner.name} is an independent AI Business Works Partner and is not an employee or
              agent of {SITE.name}. Statements on this profile are the Partner&apos;s own.
            </Disclaimer>
          </div>
        </Container>
      </Section>
    </>
  );
}

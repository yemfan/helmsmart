import { Hero } from "@/components/hero";
import { Journey } from "@/components/journey";
import { Portfolio } from "@/components/portfolio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { company, portfolio } from "@/lib/content";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: company.name,
  url: company.url,
  logo: `${company.url}/maxy-logo.png`,
  description: company.description,
  telephone: company.phone,
  email: company.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: company.address.street,
    addressLocality: company.address.city,
    addressRegion: company.address.state,
    postalCode: company.address.zip,
    addressCountry: "US",
  },
  subOrganization: portfolio.map((item) => ({
    "@type": "Organization",
    name: item.name,
    description: item.summary,
    ...(item.href ? { url: item.href } : {}),
  })),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <Portfolio />
        <Journey />
      </main>
      <SiteFooter />
    </>
  );
}

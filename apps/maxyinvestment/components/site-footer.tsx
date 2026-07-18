import { company } from "@/lib/content";
import { Container } from "./section";

const telHref = `tel:${company.phone.replace(/[^\d+]/g, "")}`;

export function SiteFooter() {
  return (
    <footer id="contact" className="bg-navy-900 py-12 text-white">
      <Container className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="font-serif text-2xl font-bold">{company.name}</h2>
          <p className="mt-3 max-w-[520px] text-navy-200">
            Building intelligent businesses across real estate, hospitality, technology, and
            emerging industries.
          </p>
        </div>
        <address className="space-y-4 not-italic text-navy-200">
          <p>
            {company.address.street}
            <br />
            {company.address.city}, {company.address.state} {company.address.zip}
          </p>
          <p className="space-y-1">
            <a href={telHref} className="block hover:text-white">
              {company.phone}
            </a>
            <a href={`mailto:${company.email}`} className="block hover:text-white">
              {company.email}
            </a>
            <a href={company.url} className="block hover:text-white">
              {company.website}
            </a>
          </p>
        </address>
      </Container>
      <Container className="mt-10 border-t border-white/10 pt-6 text-sm text-navy-300">
        © {new Date().getFullYear()} {company.name} All rights reserved.
      </Container>
    </footer>
  );
}

import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { Container, Eyebrow } from "@/components/section";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${company.name} — investment, technology, and real estate in Sugar Land, Texas.`,
  alternates: { canonical: "/contact" },
};

const telHref = `tel:${company.phone.replace(/[^\d+]/g, "")}`;

export default function ContactPage() {
  return (
    <main id="main-content" className="bg-gradient-to-b from-white to-mist">
      <Container className="py-16 sm:py-24">
        <Eyebrow>Contact</Eyebrow>
        <h1 className="mt-2 mb-5 font-serif text-[clamp(2.5rem,6vw,4rem)] font-bold leading-none text-navy-800">
          Let&rsquo;s talk.
        </h1>
        <p className="mb-12 max-w-[640px] text-lg text-navy-500">
          Whether you&rsquo;re exploring an investment, a partnership, or a new venture, we&rsquo;d
          like to hear from you.
        </p>

        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
            <ContactForm email={company.email} />
          </div>

          <aside className="space-y-8">
            <div>
              <h2 className="font-serif text-xl font-bold text-navy-800">Office</h2>
              <address className="mt-2 not-italic leading-relaxed text-navy-500">
                {company.address.street}
                <br />
                {company.address.city}, {company.address.state} {company.address.zip}
              </address>
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-navy-800">Direct</h2>
              <p className="mt-2 space-y-1">
                <a href={telHref} className="block text-navy-500 hover:text-brand-500">
                  {company.phone}
                </a>
                <a
                  href={`mailto:${company.email}`}
                  className="block text-navy-500 hover:text-brand-500"
                >
                  {company.email}
                </a>
              </p>
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-navy-800">Response time</h2>
              <p className="mt-2 text-navy-500">
                We read every message and typically reply within one business day.
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}

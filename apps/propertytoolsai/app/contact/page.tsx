import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import MarketingContentLayout from "@/components/layout/MarketingContentLayout";
import ContactForm from "./ContactForm";

/**
 * TOM validation report CR-003: the previous /contact page had no email, no
 * phone, no address, no form — just a vague "use the contact path linked
 * from your account" sentence. That's a broken user-facing function.
 *
 * This page now surfaces a working support email + a minimal contact form
 * (POSTs to /api/contact). Phone is deliberately omitted until a staffed
 * line exists — publishing a number we don't answer is worse than no number.
 */

const SUPPORT_EMAIL = "support@propertytoolsai.com";

export const metadata: Metadata = {
  title: "Contact Us | PropertyTools AI",
  description:
    "Email PropertyTools AI support or send a message — support, partnerships, and press inquiries.",
  alternates: { canonical: "/contact" },
  keywords: ["PropertyTools AI contact", "support", "partnerships", "press"],
};

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "PropertyTools AI",
          legalName: "MAXY Investment Inc.",
          url: "https://propertytoolsai.com",
          address: {
            "@type": "PostalAddress",
            streetAddress: "6511 Parkriver Crossing",
            addressLocality: "Sugar Land",
            addressRegion: "TX",
            postalCode: "77479",
            addressCountry: "US",
          },
          contactPoint: [
            {
              "@type": "ContactPoint",
              contactType: "Customer Support",
              email: SUPPORT_EMAIL,
              availableLanguage: ["en"],
              url: "https://propertytoolsai.com/contact",
            },
          ],
        }}
      />
      <MarketingContentLayout
        eyebrow="Contact"
        title="Get in touch"
        intro="Support, partnerships, press — we aim to respond within one business day."
      >
        <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <aside className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                Email us
              </h2>
              <p className="mt-2">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-lg font-medium text-[#0072ce] hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Best for support, bug reports, and account questions.
              </p>
            </section>
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                Response time
              </h2>
              <p className="mt-2 text-sm">
                One business day during weekdays. Weekends and holidays may be slower.
              </p>
            </section>
            {/* Business information — names the operating legal entity +
                registered address so carriers / trust vendors can verify the
                PropertyTools AI ↔ propertytoolsai.com association. */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                Business information
              </h2>
              <address className="mt-2 text-sm not-italic leading-relaxed text-slate-600">
                <span className="font-medium text-slate-900">MAXY Investment Inc.</span>
                <br />
                PropertyTools AI is a service of MAXY Investment Inc.
                <br />
                6511 Parkriver Crossing
                <br />
                Sugar Land, TX 77479
                <br />
                United States
              </address>
            </section>
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                Other topics
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>
                  <strong className="text-slate-900">Partnerships:</strong>{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Partnership%20inquiry`}
                    className="text-[#0072ce] hover:underline"
                  >
                    send a partnership note
                  </a>
                </li>
                <li>
                  <strong className="text-slate-900">Press / media:</strong>{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Press%20inquiry`}
                    className="text-[#0072ce] hover:underline"
                  >
                    send a press note
                  </a>
                </li>
                <li>
                  <strong className="text-slate-900">Estimate accuracy:</strong>{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Bad%20home%20value%20estimate`}
                    className="text-[#0072ce] hover:underline"
                  >
                    report an inaccurate estimate
                  </a>{" "}
                  — corrections feed our calibration pipeline.
                </li>
              </ul>
            </section>
          </aside>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
              Send a message
            </h2>
            <ContactForm supportEmail={SUPPORT_EMAIL} />
          </section>
        </div>
      </MarketingContentLayout>
    </>
  );
}

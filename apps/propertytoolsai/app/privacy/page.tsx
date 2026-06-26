import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";

/**
 * [REQUIRES LEGAL REVIEW]
 *
 * Replaces the pre-launch placeholder flagged in TOM validation report CR-001
 * for PropertyToolsAI (the previous version literally contained the
 * dev-team instruction "refer to the complete policy your team maintains for
 * production" — visible to end users).
 *
 * Scaffold covers every topic a privacy policy for a real-estate calculator +
 * AI-valuation product must address. None of it is legal advice. Before paid
 * launch, replace with counsel-reviewed or generator-produced copy tailored
 * to:
 *   - Valuation data sources (public records, MLS where licensed,
 *     user-submitted property details)
 *   - AI processing (OpenAI / Anthropic) as sub-processors
 *   - Analytics + advertising cookies when wired
 *   - Stripe payment processing for Premium
 *   - CCPA/CPRA + GDPR user rights
 *
 * Sections still marked "[REQUIRES LEGAL REVIEW]" are gaps to close.
 *
 * Anchor ids for cookies (#cookies) and CCPA rights (#ccpa) are referenced
 * by the global footer ("Cookie Policy" + "Do Not Sell My Info" links) — keep
 * those stable, renaming breaks CCPA compliance link targets.
 */

const LAST_UPDATED = "April 17, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How PropertyTools AI collects, uses, shares, and protects your personal information, including home-valuation data, AI processing, and your GDPR/CCPA rights.",
  alternates: { canonical: "/privacy" },
  keywords: ["privacy policy", "data protection", "GDPR", "CCPA", "CPRA", "cookies"],
};

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <>
        <p>
          PropertyTools AI (&ldquo;PropertyTools,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
          or &ldquo;our&rdquo;), a service of MAXY Investment Inc., a Texas corporation,
          operates the website propertytoolsai.com and provides AI-
          assisted home valuation, calculators, market reports, and related services (the
          &ldquo;Service&rdquo;). This Privacy Policy explains what information we collect,
          how we use and share it, and the choices you have.
        </p>
        <p>
          By using the Service you agree to the practices described here. If you do not
          agree, please do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information we collect",
    body: (
      <>
        <p>We collect:</p>
        <ul>
          <li>
            <strong>Information you give us</strong> — account details (name, email,
            phone when you opt in), property details you enter into tools (address, beds,
            baths, square footage, renovation notes, asking price, etc.), payment
            information processed by our payment processor, and support communications.
          </li>
          <li>
            <strong>Information about how you use the Service</strong> — pages viewed,
            tools used, device and browser identifiers, IP address, approximate location,
            session duration, referrer, and error diagnostics.
          </li>
          <li>
            <strong>Public-records data</strong> — to produce valuation estimates we
            combine your inputs with publicly available parcel, deed, and sale-history
            data from third-party providers.
          </li>
        </ul>
        <p>
          [REQUIRES LEGAL REVIEW] Enumerate the specific categories of personal
          information collected for CCPA/CPRA purposes (identifiers, commercial
          information, internet activity, geolocation, professional information,
          inferences).
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How we use information",
    body: (
      <>
        <p>We use the information above to:</p>
        <ul>
          <li>Deliver valuation estimates, reports, and calculator outputs.</li>
          <li>Personalize the product experience and generate AI-assisted recommendations.</li>
          <li>Provide customer support and respond to inquiries.</li>
          <li>
            Detect and prevent fraud, abuse, and violations of our{" "}
            <Link href="/terms" className="text-[#0072ce] hover:underline">
              Terms of Service
            </Link>
            .
          </li>
          <li>Comply with legal obligations and enforce our rights.</li>
          <li>
            Send product updates, security notices, and (with your consent) marketing
            communications.
          </li>
        </ul>
        <p>
          [REQUIRES LEGAL REVIEW] Confirm whether aggregated/de-identified data is used
          for model calibration across customers; if so, disclose with an opt-out.
        </p>
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "4. AI processing",
    body: (
      <>
        <p>
          PropertyTools uses third-party AI providers — currently OpenAI and Anthropic —
          to generate valuation narratives, summaries, and recommendations. When we send
          data to these providers:
        </p>
        <ul>
          <li>Only the content needed for the specific task is transmitted.</li>
          <li>
            Providers act as data processors under agreements that prohibit using the
            data to train their models for other customers.
          </li>
          <li>
            Generated output is treated as your data and subject to the same protections
            as the input.
          </li>
        </ul>
        <p>
          See our{" "}
          <Link href="/methodology" className="text-[#0072ce] hover:underline">
            valuation methodology
          </Link>{" "}
          for more on the data inputs our AI models receive.
        </p>
        <p>
          [REQUIRES LEGAL REVIEW] Confirm sub-processor DPA terms, list each provider and
          its purpose, and state whether content is retained after processing.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "5. How we share information",
    body: (
      <>
        <p>We share information only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> — hosting (Vercel, Supabase), payments
            (Stripe), email delivery (Resend / SendGrid), AI inference (OpenAI,
            Anthropic), analytics (where enabled), and customer support tools.
          </li>
          <li>
            <strong>Public-records + MLS providers</strong> — we query these for parcel
            and sale data; data flows one way (into the Service).
          </li>
          <li>
            <strong>Legal and safety</strong> — when required by law, subpoena, court
            order, or to protect rights, property, or safety.
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger,
            acquisition, or sale of assets.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal information in exchange for monetary
          consideration. [REQUIRES LEGAL REVIEW] Confirm with counsel whether any data
          sharing constitutes a &ldquo;sale&rdquo; or &ldquo;share&rdquo; under CCPA/CPRA
          definitions, which are broader than intuitive.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "6. Cookies and tracking",
    body: (
      <>
        <p>We use cookies and similar technologies in four categories:</p>
        <ul>
          <li>
            <strong>Strictly necessary</strong> — keeps you signed in, remembers your
            preferences, prevents CSRF. Always on; required for the site to work.
          </li>
          <li>
            <strong>Functional</strong> — remembers UI preferences (e.g., address
            autofill). On by default; can be disabled in your browser.
          </li>
          <li>
            <strong>Analytics</strong> — aggregated usage and performance data. Off
            unless you opt in via the consent banner.
          </li>
          <li>
            <strong>Advertising / marketing</strong> — measures the effectiveness of
            marketing and remembers cross-visit preferences. Off unless you opt in.
          </li>
        </ul>
        <p>
          You can change your cookie preferences any time from the &ldquo;Cookie
          settings&rdquo; link in the footer. Blocking strictly necessary cookies will
          break functions like staying signed in.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "7. Your rights",
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>Access the personal information we hold about you.</li>
          <li>Correct inaccurate information.</li>
          <li>Delete your account and associated personal information.</li>
          <li>Export your data in a portable format.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Withdraw consent to marketing communications.</li>
          <li>
            Opt out of any &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal
            information as defined under CCPA/CPRA (we do not believe we engage in
            either — see section 5).
          </li>
        </ul>
        <p>
          Exercise any of these rights by emailing{" "}
          <a
            href="mailto:support@propertytoolsai.com"
            className="text-[#0072ce] hover:underline"
          >
            support@propertytoolsai.com
          </a>
          . We respond within the timeframes required by applicable law.
        </p>
      </>
    ),
  },
  {
    id: "ccpa",
    title: "8. California residents — CCPA / CPRA",
    body: (
      <>
        <p>
          If you are a California resident, you have additional rights under the
          California Consumer Privacy Act (CCPA) and the California Privacy Rights Act
          (CPRA):
        </p>
        <ul>
          <li>
            <strong>Right to know</strong> the categories of personal information we
            have collected, the sources, business purposes, and categories of third
            parties we share with (see sections 2 and 5).
          </li>
          <li>
            <strong>Right to delete</strong> personal information we have collected,
            with limited exceptions.
          </li>
          <li>
            <strong>Right to correct</strong> inaccurate personal information.
          </li>
          <li>
            <strong>Right to limit use</strong> of sensitive personal information.
          </li>
          <li>
            <strong>Right to opt out of sale or sharing</strong> — we do not believe we
            sell or share personal information under CCPA/CPRA definitions. If this ever
            changes, we will provide a &ldquo;Do Not Sell or Share My Personal
            Information&rdquo; link and honor opt-outs globally.
          </li>
          <li>
            <strong>Right to non-discrimination</strong> — we will not discriminate
            against you for exercising these rights.
          </li>
        </ul>
        <p>
          To submit a request, email{" "}
          <a
            href="mailto:support@propertytoolsai.com"
            className="text-[#0072ce] hover:underline"
          >
            support@propertytoolsai.com
          </a>{" "}
          with the subject &ldquo;CCPA request.&rdquo; We verify identity before
          fulfilling.
        </p>
        <p>
          [REQUIRES LEGAL REVIEW] Confirm the final wording of this section once counsel
          finalizes whether any data sharing is a &ldquo;sale&rdquo; or
          &ldquo;share&rdquo; under CPRA.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "9. Retention",
    body: (
      <>
        <p>
          We keep personal information for as long as your account is active and for a
          reasonable period afterward to handle support issues, enforce agreements, and
          comply with law. When your account is deleted we remove or anonymize personal
          information within 90 days, except where retention is required for legal,
          accounting, or fraud-prevention purposes.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "10. Security",
    body: (
      <>
        <p>
          We apply industry-standard safeguards: encryption in transit (TLS) and at
          rest, access controls, audit logging, and regular security reviews. No method
          of transmission or storage is 100% secure, but we work to protect your
          information and promptly investigate incidents.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "11. Children",
    body: (
      <>
        <p>
          The Service is not directed to children under 16. We do not knowingly collect
          personal information from children. If you believe we have inadvertently
          collected information from a child, contact us so we can delete it.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "12. Changes to this policy",
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be
          notified via email or a prominent notice in the Service at least 30 days
          before they take effect. The &ldquo;last updated&rdquo; date at the top always
          reflects the current version.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "13. Contact",
    body: (
      <>
        <p>
          Questions about this Privacy Policy can be directed to{" "}
          <a
            href="mailto:support@propertytoolsai.com"
            className="text-[#0072ce] hover:underline"
          >
            support@propertytoolsai.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Privacy Policy",
          url: "https://propertytoolsai.com/privacy",
          description:
            "How PropertyTools AI collects, uses, shares, and protects your personal information.",
        }}
      />

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Notice:</strong> This page is a pre-launch scaffold. It covers the
        topics a real privacy policy must address but is <strong>not legal advice</strong>
        {" "}and must be replaced with counsel-reviewed or generator-produced copy before
        paid launch.
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <nav
        aria-label="Table of contents"
        className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Contents
        </div>
        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-[#0072ce] hover:underline">
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="space-y-8 text-slate-700">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-slate-900 mb-3">{s.title}</h2>
            <div className="space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mt-3">
              {s.body}
            </div>
          </section>
        ))}
      </article>

      <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        See also our{" "}
        <Link href="/terms" className="text-[#0072ce] hover:underline">
          Terms of Service
        </Link>
        .{" "}
        <Link href="/" className="ml-2 text-[#0072ce] hover:underline">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";

/**
 * [REQUIRES LEGAL REVIEW]
 *
 * Replaces the pre-launch placeholder flagged in TOM validation report CR-002
 * for PropertyToolsAI. Scaffold covers standard SaaS + the specifics of an
 * AI valuation + real-estate calculator product:
 *   - Premium subscription billing ($19/mo) via Stripe
 *   - AI output ownership + disclaimers
 *   - Estimate accuracy disclaimer (AVM, not appraisal)
 *   - Acceptable use + scraping prohibition
 *
 * None of it is legal advice. Before paid launch, replace with counsel-
 * reviewed or generator-produced copy.
 *
 * Sections still marked "[REQUIRES LEGAL REVIEW]" are gaps — especially
 * liability caps, arbitration/venue, and governing law.
 */

const LAST_UPDATED = "April 17, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing use of PropertyTools AI calculators, home-value estimates, market reports, and Premium subscription.",
  alternates: { canonical: "/terms" },
  keywords: ["terms of service", "terms of use", "subscription terms", "acceptable use"],
};

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "agreement",
    title: "1. Agreement to these terms",
    body: (
      <>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of
          propertytoolsai.com and the PropertyTools AI Service (the &ldquo;Service&rdquo;)
          provided by PropertyTools AI, a service of MAXY Investment Inc., a Texas
          corporation (&ldquo;PropertyTools,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account, using any
          calculator or tool, or subscribing to Premium, you agree to these Terms and our{" "}
          <Link href="/privacy" className="text-[#0072ce] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          If you are using the Service on behalf of an organization, you represent that
          you have authority to bind that organization to these Terms.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "2. Eligibility",
    body: (
      <>
        <p>
          You must be at least 18 years old and legally able to form a binding contract in
          your jurisdiction. You are responsible for complying with all laws applicable
          to your use of the Service.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "3. Your account",
    body: (
      <>
        <p>
          Some features require an account. You agree to provide accurate information
          during signup and to keep it up to date. You are responsible for safeguarding
          your credentials and for all activity under your account. Notify us immediately
          at{" "}
          <a
            href="mailto:support@propertytoolsai.com"
            className="text-[#0072ce] hover:underline"
          >
            support@propertytoolsai.com
          </a>{" "}
          if you suspect unauthorized access.
        </p>
      </>
    ),
  },
  {
    id: "subscription",
    title: "4. Free tier, Premium subscription, billing",
    body: (
      <>
        <ul>
          <li>
            <strong>Free tier.</strong> Core calculators and tools are available without
            an account, subject to fair-use daily limits we publish in the product.
          </li>
          <li>
            <strong>Premium.</strong> Premium is a recurring monthly subscription
            (currently $19/month) that removes daily caps and unlocks full exports,
            unlimited CMA reports, and other features described on the pricing page. By
            subscribing to Premium you authorize us to charge your payment method on
            file through our payment processor (Stripe) on each billing cycle until
            cancellation.
          </li>
          <li>
            <strong>Free trial.</strong> Premium includes a free trial of up to 7 days
            unless otherwise stated. Unless you cancel during the trial, the paid
            subscription begins at the end of the trial. Trials are limited to one per
            customer; we may refuse trials we reasonably believe to be abusive.
          </li>
          <li>
            <strong>Cancellation.</strong> You can cancel at any time from your account.
            Cancellation takes effect at the end of the current billing period, and you
            retain access until then.
          </li>
          <li>
            <strong>Refunds.</strong> Except where required by law, subscription payments
            are non-refundable once the billing period has started.
          </li>
          <li>
            <strong>Price changes.</strong> We may change prices prospectively with at
            least 30 days&apos; notice.
          </li>
          <li>
            <strong>Taxes.</strong> Prices do not include taxes unless stated.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "estimates-disclaimer",
    title: "5. Estimates and AI output — not an appraisal",
    body: (
      <>
        <p>
          Home-value estimates, rent estimates, market reports, and AI-generated
          recommendations are informational and are <strong>not</strong> a substitute for
          a licensed appraisal, legal advice, or tax advice. Typical-case error for AVM-
          based estimates is disclosed in our{" "}
          <Link href="/methodology" className="text-[#0072ce] hover:underline">
            methodology page
          </Link>
          ; individual estimates may vary materially.
        </p>
        <p>
          You are responsible for verifying any number before relying on it for a
          transaction, financing, or tax decision. Do not use the Service as the sole
          basis for pricing a home to list, qualifying for refinance, or negotiating a
          contract.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service in violation of any law or regulation.</li>
          <li>
            Scrape, crawl, or bulk-download data from the Service except via documented
            APIs under a separate agreement.
          </li>
          <li>
            Reverse-engineer the Service, copy our models, or use the output to train a
            competing product.
          </li>
          <li>
            Resell access without our written consent, or circumvent fair-use daily
            limits via multiple accounts.
          </li>
          <li>
            Upload unlawful, infringing, deceptive, or otherwise objectionable content.
          </li>
          <li>Impersonate any person or misrepresent your affiliation.</li>
        </ul>
        <p>
          We may suspend or terminate your access for violations, with or without notice,
          depending on severity.
        </p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "7. Your content",
    body: (
      <>
        <p>
          You retain all rights in the data, text, files, and addresses you submit to the
          Service (&ldquo;Your Content&rdquo;). You grant PropertyTools a worldwide,
          royalty-free license to host, process, display, and transmit Your Content
          solely to provide the Service, comply with law, and improve the Service in
          aggregated, de-identified form.
        </p>
        <p>
          You represent that you have all rights necessary to submit Your Content and
          that its use in the Service does not violate any law or third-party right.
        </p>
      </>
    ),
  },
  {
    id: "ai-output",
    title: "8. AI-generated output",
    body: (
      <>
        <p>
          The Service uses third-party AI providers to generate text (valuation
          narratives, summaries, recommendations). You own the AI Output generated for
          your account, subject to the third-party provider&apos;s terms and any rights
          retained by those providers in their underlying models.
        </p>
        <p>
          AI Output is provided &ldquo;as is.&rdquo; It may contain errors, omissions, or
          hallucinations. You are responsible for reviewing AI Output before relying on
          it or sharing it with a third party.
        </p>
      </>
    ),
  },
  {
    id: "our-ip",
    title: "9. Our intellectual property",
    body: (
      <>
        <p>
          The Service, including all software, designs, text, graphics, valuation models,
          and other materials provided by PropertyTools (excluding Your Content and AI
          Output), is owned by PropertyTools or our licensors and is protected by
          intellectual property laws. Nothing in these Terms transfers those rights to
          you.
        </p>
        <p>
          Feedback you provide about the Service is non-confidential and PropertyTools
          may use it without restriction.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "10. Disclaimers",
    body: (
      <>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo;
          without warranties of any kind, whether express, implied, or statutory. To the
          maximum extent permitted by law, PropertyTools disclaims all warranties,
          including merchantability, fitness for a particular purpose, non-infringement,
          and accuracy of estimates or AI Output.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "11. Limitation of liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, PropertyTools&apos;s aggregate
          liability for any claim arising out of or related to these Terms or the Service
          will not exceed the greater of (a) the fees paid by you to PropertyTools in the
          12 months preceding the claim, or (b) one hundred U.S. dollars ($100).
        </p>
        <p>
          In no event will PropertyTools be liable for indirect, incidental, special,
          consequential, or exemplary damages (including lost profits or lost data)
          arising from your use of the Service.
        </p>
        <p>
          [REQUIRES LEGAL REVIEW] Confirm liability cap, carve-outs, and
          jurisdiction-specific limits.
        </p>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "12. Indemnification",
    body: (
      <>
        <p>
          You agree to defend, indemnify, and hold harmless PropertyTools and its
          affiliates from and against any third-party claim arising out of (a) Your
          Content, (b) your use of the Service in violation of these Terms or applicable
          law, or (c) your violation of a third-party right.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "13. Termination",
    body: (
      <>
        <p>
          You may delete your account at any time. PropertyTools may suspend or terminate
          your access for violation of these Terms, non-payment, or when required by law,
          with or without notice depending on severity. Sections that by their nature
          should survive termination will do so, including sections 7, 9–12, and 14–16.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "14. Changes to these Terms",
    body: (
      <>
        <p>
          We may update these Terms from time to time. Material changes will be notified
          via email or a prominent notice in the Service at least 30 days before they
          take effect. If you do not accept the revised Terms, your sole remedy is to
          stop using the Service and cancel your subscription.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "15. Governing law and disputes",
    body: (
      <>
        <p>
          [REQUIRES LEGAL REVIEW] These Terms are governed by the laws of{" "}
          <span className="italic">[State / jurisdiction — confirm with counsel]</span>,
          without regard to conflict-of-laws principles. Any dispute will be resolved in
          the state or federal courts located in{" "}
          <span className="italic">[venue — confirm with counsel]</span>, except that
          either party may seek injunctive relief in any court of competent
          jurisdiction.
        </p>
        <p>
          [REQUIRES LEGAL REVIEW] Consider adding an arbitration clause + class-action
          waiver, and confirm enforceability in target jurisdictions.
        </p>
      </>
    ),
  },
  {
    id: "misc",
    title: "16. Miscellaneous",
    body: (
      <>
        <ul>
          <li>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy are the
            entire agreement between you and PropertyTools regarding the Service.
          </li>
          <li>
            <strong>Severability.</strong> If any provision is held unenforceable, the
            rest will remain in effect.
          </li>
          <li>
            <strong>Assignment.</strong> You may not assign these Terms without our
            consent; we may assign them in connection with a merger, acquisition, or sale
            of assets.
          </li>
          <li>
            <strong>No waiver.</strong> Our failure to enforce a provision is not a
            waiver.
          </li>
          <li>
            <strong>Contact.</strong> Notices to PropertyTools should be sent to{" "}
            <a
              href="mailto:support@propertytoolsai.com"
              className="text-[#0072ce] hover:underline"
            >
              support@propertytoolsai.com
            </a>
            .
          </li>
        </ul>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Terms of Service",
          url: "https://propertytoolsai.com/terms",
          description:
            "Terms governing use of PropertyTools AI calculators, home-value estimates, and Premium subscription.",
        }}
      />

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Notice:</strong> This page is a pre-launch scaffold. It covers standard
        SaaS topics but is <strong>not legal advice</strong> and must be replaced with
        counsel-reviewed or generator-produced copy before paid launch.
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
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
        <Link href="/privacy" className="text-[#0072ce] hover:underline">
          Privacy Policy
        </Link>
        .{" "}
        <Link href="/" className="ml-2 text-[#0072ce] hover:underline">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

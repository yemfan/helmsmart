import type { Metadata } from "next";
import Link from "next/link";

const LAST_UPDATED = "April 24, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing use of the LeadSmart AI lead management, CRM, and automation service — subscription, acceptable use, SMS/email compliance, intellectual property, liability, and disputes.",
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
          realtybossai.com and the LeadSmart AI Service (the &ldquo;Service&rdquo;)
          provided by MAXY Investment Inc., a Texas corporation, doing business as
          LeadSmart AI (&ldquo;LeadSmart,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
          or &ldquo;our&rdquo;). By creating an account, starting a
          trial, or otherwise using the Service, you agree to these Terms and our{" "}
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
          your jurisdiction. The Service is intended for use by licensed real estate
          professionals and their teams. You are responsible for complying with all laws
          applicable to your use of the Service, including real estate licensing,
          fair-housing rules, and messaging regulations.
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
          You agree to provide accurate, complete, and current information during signup
          and to keep it up to date. You are responsible for safeguarding your credentials
          and for all activity under your account. Notify us immediately at{" "}
          <a
            href="mailto:contact@realtybossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@realtybossai.com
          </a>{" "}
          if you suspect unauthorized access.
        </p>
      </>
    ),
  },
  {
    id: "subscription",
    title: "4. Subscriptions, trials, and billing",
    body: (
      <>
        <ul>
          <li>
            <strong>Plans.</strong> Paid plans are offered on a monthly or annual
            subscription basis as described on the pricing page. By selecting a paid plan,
            you authorize us to charge the payment method on file through our payment
            processor (Stripe) on each billing period until cancellation.
          </li>
          <li>
            <strong>Free trials.</strong> Paid plans may include a free trial (currently
            up to 14 days). Unless you cancel during the trial, the paid subscription
            begins and billing starts at the end of the trial. Trials are limited to one
            per customer; we may refuse trials we reasonably believe to be abusive.
          </li>
          <li>
            <strong>Cancellation.</strong> You can cancel at any time from the billing
            page. Cancellation takes effect at the end of the current billing period, and
            you retain access until then.
          </li>
          <li>
            <strong>Refunds.</strong> Except where required by law, subscription payments
            are non-refundable once the billing period has started.
          </li>
          <li>
            <strong>Price changes.</strong> We may change prices prospectively with at
            least 30 days&apos; notice. The new price applies on the next billing period
            after the notice period ends.
          </li>
          <li>
            <strong>Taxes.</strong> Prices do not include taxes unless stated. You are
            responsible for applicable taxes and duties.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "5. Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>
            Use the Service to send unsolicited SMS or email (as defined by the TCPA,
            CAN-SPAM Act, CASL, GDPR, or analogous law).
          </li>
          <li>
            Violate any applicable law or regulation, including real estate licensing,
            fair-housing, anti-discrimination, consumer protection, or data protection
            law.
          </li>
          <li>
            Upload unlawful, infringing, deceptive, harassing, or otherwise objectionable
            content, including content that violates a third party&apos;s privacy or
            intellectual-property rights.
          </li>
          <li>
            Attempt to probe, scan, reverse-engineer, or circumvent the security or
            integrity of the Service.
          </li>
          <li>
            Use the Service to build or train a competing product, or to resell access
            without our written consent.
          </li>
          <li>Impersonate any person or falsely imply sponsorship or affiliation.</li>
        </ul>
        <p>
          We may suspend or terminate your access for violations of this section with or
          without notice, depending on severity.
        </p>
      </>
    ),
  },
  {
    id: "sms-email-compliance",
    title: "6. SMS and email compliance",
    body: (
      <>
        <p>
          The Service sends SMS and email on your behalf. By using these features, you:
        </p>
        <ul>
          <li>
            Represent and warrant that you have obtained the consents required by the
            Telephone Consumer Protection Act (47 U.S.C. § 227), FCC rules, CAN-SPAM Act,
            and analogous laws in your jurisdiction.
          </li>
          <li>
            Honor opt-outs immediately. We automatically suppress STOP / UNSUBSCRIBE /
            HELP requests for numbers and addresses on your account, but you remain
            responsible for wider compliance across channels.
          </li>
          <li>
            Indemnify LeadSmart for claims arising from your failure to obtain consent or
            from content you cause the Service to send.
          </li>
        </ul>
        <p className="font-semibold text-slate-900">10DLC brand and sender allocation</p>
        <p>
          LeadSmart operates the SMS sending infrastructure under its own
          registered 10DLC brand and campaign with The Campaign Registry
          (TCR). For purposes of the laws listed above, Customer is the
          &ldquo;caller&rdquo; under the TCPA and the &ldquo;sender&rdquo; under
          CAN-SPAM. That means:
        </p>
        <ul>
          <li>
            <strong>Customer is responsible for</strong> obtaining and
            documenting prior express written consent from each recipient,
            for the content of every message, and for accurate identification
            of itself as the sender.
          </li>
          <li>
            <strong>LeadSmart is responsible for</strong> carrier registration
            and brand maintenance, throughput compliance, opt-out automation
            (STOP / UNSUBSCRIBE / HELP across English and Chinese keyword
            sets), and rate-limit enforcement at the platform level.
          </li>
        </ul>
        <p>
          Enterprise customers may elect to bring their own 10DLC brand and
          campaign for a separate legal identity or higher throughput tier;
          contact{" "}
          <a
            href="mailto:contact@realtybossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@realtybossai.com
          </a>{" "}
          to discuss.
        </p>
      </>
    ),
  },
  {
    // Consumer-facing SMS program disclosure required by mobile carriers /
    // CTIA for A2P 10DLC campaign registration. Distinct from §6 (which is
    // the B2B acceptable-use contract with agents): this section is the
    // "Terms & Conditions URL" submitted to The Campaign Registry and must
    // carry program name, message types, frequency, "msg & data rates may
    // apply," and STOP/HELP in bold. Keep these elements if editing.
    id: "sms-program",
    title: "6A. Text messaging program (SMS)",
    body: (
      <>
        <p>
          This section is the consumer disclosure for the RealtyBoss text
          messaging program operated by MAXY Investment Inc. and the licensed
          real estate agents who use the Service.
        </p>
        <ul>
          <li>
            <strong>Program:</strong> RealtyBoss (a product of MAXY Investment
            Inc.). When you provide your mobile number to an agent — by
            submitting a contact or property-inquiry form, or directly — and
            agree to be contacted, the agent may send you text messages such as
            replies to your inquiry, showing and appointment confirmations,
            listing and home-search updates, and follow-ups.
          </li>
          <li>
            <strong>Message frequency</strong> varies based on your interaction
            with the agent; it is not a fixed recurring schedule.
          </li>
          <li>
            <strong>Message and data rates may apply.</strong> These are charged
            by your mobile carrier and are your responsibility.
          </li>
          <li>
            <strong>To opt out, reply STOP</strong> to any message at any time;
            you will receive a single confirmation and no further texts.{" "}
            <strong>For help, reply HELP</strong> or email{" "}
            <a
              href="mailto:contact@realtybossai.com"
              className="text-[#0072ce] hover:underline"
            >
              contact@realtybossai.com
            </a>
            .
          </li>
          <li>
            Carriers are not liable for delayed or undelivered messages. Your
            consent to receive texts is not a condition of any purchase.
          </li>
        </ul>
        <p>
          How we handle the information you provide is described in our{" "}
          <Link href="/privacy" className="text-[#0072ce] hover:underline">
            Privacy Policy
          </Link>
          . Mobile information is never shared with third parties or affiliates
          for their own marketing or promotional purposes.
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
          You retain all rights in the data, text, files, and other materials you submit
          to the Service (&ldquo;Your Content&rdquo;). You grant LeadSmart a worldwide,
          royalty-free license to host, process, display, and transmit Your Content solely
          to provide the Service, comply with law, and improve the Service in aggregated,
          de-identified form.
        </p>
        <p>
          You represent that you have all rights necessary to submit Your Content and that
          its use in the Service does not violate law or any third-party right.
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
          The Service uses third-party AI providers to generate messages, summaries, and
          recommendations (&ldquo;AI Output&rdquo;). You own the AI Output generated for
          your account, subject to the third-party provider&apos;s terms and any rights
          retained by those providers in their underlying models.
        </p>
        <p>
          AI Output is provided &ldquo;as is.&rdquo; It may contain errors, omissions, or
          hallucinations. You are responsible for reviewing AI Output before relying on it
          or sending it to a third party.
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
          The Service, including all software, designs, text, graphics, and other
          materials provided by LeadSmart (excluding Your Content and AI Output), is owned
          by LeadSmart or our licensors and is protected by intellectual property laws.
          Nothing in these Terms transfers those rights to you.
        </p>
        <p>
          Feedback you provide about the Service is non-confidential and LeadSmart may use
          it without restriction.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "10. Third-party services and integrations",
    body: (
      <>
        <p>
          The Service integrates with third-party services (Zillow, Follow Up Boss,
          kvCORE, Twilio, SendGrid, Stripe, Google, Facebook, and others). Your use of
          those services is governed by their own terms and privacy policies. LeadSmart is
          not responsible for third-party services.
        </p>
        <p>
          <strong>Inbound email forwarding (optional).</strong> LeadSmart
          provisions each agent a unique inbound forwarding address (e.g.{" "}
          <code>your-name@inbox.realtybossai.com</code>) on first dashboard
          visit. If you choose to set up a Gmail / Outlook filter that
          forwards selected messages to that address, LeadSmart processes
          only the emails you explicitly forward — we have no access to your
          inbox itself. Our handling of forwarded emails is described in
          detail in section 5 of the{" "}
          <Link href="/privacy#inbound-email" className="text-[#0072ce] hover:underline">
            Privacy Policy
          </Link>
          . You can stop forwarding at any time by disabling the filter in
          your email provider, or rotate / disable your alias from
          Settings &rarr; Calendar &rarr; Email forwarding.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "11. Disclaimers",
    body: (
      <>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo;
          without warranties of any kind, whether express, implied, or statutory. To the
          maximum extent permitted by law, LeadSmart disclaims all warranties, including
          merchantability, fitness for a particular purpose, non-infringement, and
          accuracy of AI Output.
        </p>
        <p>
          LeadSmart does not warrant that messages sent through the Service will be
          delivered, that AI Output will be correct, or that the Service will be
          uninterrupted or error-free.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "12. Limitation of liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, LeadSmart&apos;s aggregate liability for
          any claim arising out of or related to these Terms or the Service will not
          exceed the greater of (a) the fees paid by you to LeadSmart in the 12 months
          preceding the claim, or (b) one hundred U.S. dollars ($100).
        </p>
        <p>
          In no event will LeadSmart be liable for indirect, incidental, special,
          consequential, or exemplary damages (including lost profits, lost leads, or
          lost data) arising from your use of the Service.
        </p>
        <p className="font-semibold text-slate-900">Carve-outs</p>
        <p>The cap and exclusions in this section do not apply to:</p>
        <ul>
          <li>
            Customer&rsquo;s failure to pay fees owed under section 4
            (Subscriptions, trials, and billing);
          </li>
          <li>
            Customer&rsquo;s indemnification obligations under section 13
            (Indemnification);
          </li>
          <li>
            either party&rsquo;s gross negligence, willful misconduct, or
            fraud; or
          </li>
          <li>
            any liability that cannot be limited or excluded under applicable
            law (including, in some jurisdictions, liability for death,
            personal injury, or fraudulent misrepresentation).
          </li>
        </ul>
        <p>
          This section will be enforced to the maximum extent permitted by
          applicable law. If a court of competent jurisdiction finds any
          portion of this section unenforceable, the remainder will continue
          to apply with full effect.
        </p>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "13. Indemnification",
    body: (
      <>
        <p>
          You agree to defend, indemnify, and hold harmless LeadSmart and its affiliates
          from and against any third-party claim arising out of (a) Your Content, (b) your
          use of the Service in violation of these Terms or applicable law, (c) any SMS
          or email sent through the Service on your behalf, or (d) your violation of a
          third-party right.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "14. Termination",
    body: (
      <>
        <p>
          You may terminate your account at any time from the billing page. LeadSmart may
          suspend or terminate your access for violation of these Terms, non-payment, or
          when required by law, with or without notice depending on severity. On
          termination, your right to use the Service ends. Sections of these Terms that by
          their nature should survive termination will do so, including sections 7, 9, 11,
          12, 13, and 15–17.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "15. Changes to these Terms",
    body: (
      <>
        <p>
          We may update these Terms from time to time. Material changes will be notified
          via email or a prominent notice in the Service at least 30 days before they take
          effect. If you do not accept the revised Terms, your sole remedy is to stop
          using the Service and cancel your subscription.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "16. Governing law and disputes",
    body: (
      <>
        <p>
          These Terms are governed by the laws of the State of Texas, without
          regard to its conflict-of-laws principles. The United Nations
          Convention on Contracts for the International Sale of Goods does not
          apply.
        </p>

        <p className="font-semibold text-slate-900">Binding individual arbitration</p>
        <p>
          Any dispute, claim, or controversy arising out of or relating to these
          Terms or the Service (a &ldquo;Dispute&rdquo;) will be resolved by{" "}
          <strong>binding individual arbitration</strong> administered by the
          American Arbitration Association (AAA) under its Commercial
          Arbitration Rules and Consumer Arbitration Rules where applicable.
          The arbitration will be conducted by a single arbitrator. The seat of
          arbitration is Texas, and proceedings may be conducted in person, by
          video, or on the documents at the arbitrator&rsquo;s discretion. The
          arbitrator&apos;s award is final and may be entered as a judgment in
          any court of competent jurisdiction.
        </p>

        <p className="font-semibold text-slate-900">Class-action waiver</p>
        <p>
          You and LeadSmart agree that any Dispute will be brought only in an
          individual capacity. <strong>Neither you nor LeadSmart will bring,
          consolidate, or participate in any class, collective, or
          representative action.</strong> The arbitrator may not consolidate
          claims of more than one person and may not preside over any form of a
          representative proceeding. If this class-action waiver is held
          unenforceable as to any specific claim, that claim (and only that
          claim) will be severed and proceed in court; the remainder of this
          section continues to apply.
        </p>

        <p className="font-semibold text-slate-900">Carve-outs from arbitration</p>
        <p>The arbitration agreement does not apply to:</p>
        <ul>
          <li>
            small-claims court actions filed in either party&rsquo;s home
            jurisdiction within the small-claims limit;
          </li>
          <li>
            either party seeking injunctive or other equitable relief in a
            court of competent jurisdiction to prevent actual or threatened
            infringement, misappropriation, or violation of intellectual
            property rights, confidentiality, or unauthorized access; or
          </li>
          <li>
            actions to compel arbitration or enforce an arbitration award.
          </li>
        </ul>

        <p className="font-semibold text-slate-900">Court venue (where arbitration does not apply)</p>
        <p>
          Where a Dispute is not subject to arbitration under the carve-outs
          above, you and LeadSmart agree to exclusive personal jurisdiction
          and venue in the state and federal courts located in Texas, except
          that either party may seek injunctive relief in any court of
          competent jurisdiction.
        </p>

        <p className="font-semibold text-slate-900">30-day opt-out</p>
        <p>
          You may opt out of this arbitration agreement by emailing{" "}
          <a
            href="mailto:contact@realtybossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@realtybossai.com
          </a>{" "}
          within 30 days of first creating your LeadSmart account. The
          notice must include your name, the email associated with your
          account, and the words &ldquo;Arbitration Opt-Out.&rdquo; Opting
          out does not affect the rest of these Terms.
        </p>
      </>
    ),
  },
  {
    id: "misc",
    title: "17. Miscellaneous",
    body: (
      <>
        <ul>
          <li>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy are the
            entire agreement between you and LeadSmart regarding the Service.
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
            <strong>Contact.</strong> Notices to LeadSmart should be sent to{" "}
            <a
              href="mailto:contact@realtybossai.com"
              className="text-[#0072ce] hover:underline"
            >
              contact@realtybossai.com
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

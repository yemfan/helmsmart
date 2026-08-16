import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

const LAST_UPDATED = "April 24, 2026";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Privacy Policy",
    description:
      "How CloseBoss collects, uses, shares, and protects your personal and business information, including SMS, email, and AI processing disclosures.",
    path: "/privacy",
  }),
  keywords: ["privacy policy", "data protection", "GDPR", "CCPA", "TCPA", "SMS consent"],
};

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <>
        <p>
          MAXY Investment Inc., a Texas corporation, doing business as CloseBoss AI
          (&ldquo;CloseBoss,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) operates the website closebossai.com and provides AI-assisted
          lead management, CRM, SMS follow-up, email automation, and related services (the
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
        <p>We collect information in three buckets:</p>
        <ul>
          <li>
            <strong>Information you give us directly</strong> — account details (name,
            email, phone, brokerage, role), billing information processed through our
            payment processor, content you create in the Service (lead records, contacts,
            messages, notes, preferences), and support communications.
          </li>
          <li>
            <strong>Information about how you use the Service</strong> — pages viewed,
            features used, device and browser identifiers, IP address, approximate location
            derived from IP, session duration, referrer, and crash or error diagnostics.
          </li>
          <li>
            <strong>Information from integrations you connect</strong> — lead sources such
            as Zillow, Realtor.com, Follow Up Boss, kvCORE, Sierra Interactive, Facebook
            Lead Ads, Google, and any IDX site you link. If you forward emails to your
            unique CloseBoss inbound address (e.g.{" "}
            <code>your-name@inbox.closebossai.com</code>), we process only those emails
            you explicitly forward to us — see section 5 for inbound email handling. We
            receive only what each integration&rsquo;s OAuth scope permits.
          </li>
        </ul>
        <p className="font-semibold text-slate-900">
          Categories collected (for California residents)
        </p>
        <p>
          For purposes of the California Consumer Privacy Act / California Privacy Rights
          Act (CCPA/CPRA), we collect the following statutory categories of personal
          information from agents using the Service:
        </p>
        <ul>
          <li>
            <strong>Identifiers</strong> — name, email, postal address, phone, account
            login, IP address, device identifiers.
          </li>
          <li>
            <strong>Customer records</strong> (Cal. Civ. Code § 1798.80) — billing
            information, brokerage / license details.
          </li>
          <li>
            <strong>Commercial information</strong> — subscription tier, transactions,
            referral activity.
          </li>
          <li>
            <strong>Internet / network activity</strong> — pages viewed, features used,
            session timing, referrer, browser + OS metadata, error diagnostics.
          </li>
          <li>
            <strong>Geolocation data</strong> — approximate location derived from IP. We
            do not collect precise device geolocation.
          </li>
          <li>
            <strong>Professional information</strong> — license number, brokerage
            affiliation, role.
          </li>
          <li>
            <strong>Inferences</strong> drawn from the above to characterize agent
            preferences and recommend product features.
          </li>
        </ul>
        <p>
          We do not knowingly collect <strong>sensitive personal information</strong>
          under CPRA § 1798.140(ae). For information about <em>contacts</em> the agent
          uploads or imports — which is the agent&rsquo;s data, not CloseBoss&rsquo;s —
          see section 5 (How we share information) and section 11 (Retention).
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How we use information",
    body: (
      <>
        <p>We use the information described above to:</p>
        <ul>
          <li>Operate, maintain, and improve the Service.</li>
          <li>
            Send automated SMS and email on your behalf to leads and contacts you manage
            (only where consent has been captured — see section 6, &ldquo;SMS and email
            compliance&rdquo;).
          </li>
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
            Send you product updates, security notices, and (with your consent) marketing
            communications.
          </li>
        </ul>
        <p className="font-semibold text-slate-900">
          We do not train AI models on your data
        </p>
        <p>
          We do <strong>not</strong> use your account information, your content (including
          contacts, messages, and notes), or AI-generated output to train, fine-tune, or
          otherwise develop generalized machine-learning models — neither our own nor
          those of any third party. If we ever change this practice we will update this
          policy and offer an opt-out before the new use begins. Data processed by our
          third-party AI providers is subject to their no-training contractual terms,
          described in section 4.
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
          CloseBoss uses third-party AI providers — currently OpenAI and Anthropic — to
          generate messages, summarize calls, and rank leads. When the Service sends data
          to these providers:
        </p>
        <ul>
          <li>Only the content needed for the specific task is transmitted.</li>
          <li>
            Providers act as data processors under agreements that prohibit using the data
            to train their models for other customers.
          </li>
          <li>
            Generated output is treated as your data and subject to the same protections as
            the input.
          </li>
        </ul>
        <p className="font-semibold text-slate-900">Current AI sub-processors</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 pr-3 font-semibold">Provider</th>
              <th className="py-2 pr-3 font-semibold">Purpose</th>
              <th className="py-2 font-semibold">Retention &amp; training</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 align-top">
              <td className="py-2 pr-3 font-medium">Anthropic (Claude)</td>
              <td className="py-2 pr-3">
                Deal review, growth opportunity generation, AI message drafting,
                contact summarization.
              </td>
              <td className="py-2">
                Per Anthropic&rsquo;s API terms: input + output retained up to 30 days
                for trust &amp; safety. <strong>No training on customer API
                inputs/outputs.</strong>
              </td>
            </tr>
            <tr className="border-b border-slate-100 align-top">
              <td className="py-2 pr-3 font-medium">OpenAI</td>
              <td className="py-2 pr-3">
                AI assistant explanations, behavior-based recommendations.
              </td>
              <td className="py-2">
                Per OpenAI&rsquo;s API data-usage policy: API inputs/outputs retained up
                to 30 days for abuse monitoring (or zero retention under ZDR
                arrangements where applicable). <strong>No training on API customer
                data by default.</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Each provider operates under its own data-protection terms (Anthropic
          Commercial Terms, OpenAI Business / API Terms) which require them to act as a
          processor of your data, prohibit secondary use, and require deletion at the
          end of the retention window. We update this table when we add or remove a
          provider; the &ldquo;last updated&rdquo; date at the top of this page reflects
          the current set.
        </p>
      </>
    ),
  },
  {
    id: "inbound-email",
    title: "5. Inbound email — your forwarding address",
    body: (
      <>
        <p>
          CloseBoss provisions each agent a unique inbound forwarding
          address (e.g. <code>your-name@inbox.closebossai.com</code>) on
          first dashboard visit. The address is yours alone, scoped to your
          account, and only processes emails you explicitly forward to it —
          typically via a Gmail / Outlook filter you configure yourself.
        </p>

        <p className="font-semibold text-slate-900">What we receive</p>
        <ul>
          <li>
            The full envelope (<strong>From</strong>, <strong>To</strong>,{" "}
            <strong>Subject</strong>) of any email forwarded to your alias.
          </li>
          <li>
            The plain-text <strong>body</strong> (first ~2,000 characters
            stored, full body kept transiently for AI extraction).
          </li>
          <li>
            <strong>Attachments</strong> (PDFs of offers, listing
            agreements, etc.) referenced by signed URLs that expire. We
            do not permanently store attachment binaries; we read them
            once for extraction and discard them.
          </li>
        </ul>

        <p className="font-semibold text-slate-900">How we use it</p>
        <ul>
          <li>
            We classify the email&rsquo;s intent (offer, listing
            agreement, showing request) using a keyword pass plus an
            optional AI overlay.
          </li>
          <li>
            We run an AI extractor against any PDF attachment to pull
            structured fields (price, dates, parties, contingencies).
          </li>
          <li>
            We create a &ldquo;Review forwarded …&rdquo; task on your
            CRM dashboard with a link to a review page where you confirm
            the parsed fields and apply them as a draft offer / listing /
            showing.
          </li>
          <li>
            We attempt a best-effort match between the sender&rsquo;s
            email and your existing CRM contacts as a <em>suggestion</em>{" "}
            you confirm or override — never auto-routed.
          </li>
        </ul>

        <p className="font-semibold text-slate-900">How we don&apos;t use it</p>
        <ul>
          <li>
            We do <strong>not</strong> read emails sent to other
            addresses on your domain — only your unique CloseBoss alias.
          </li>
          <li>
            We do <strong>not</strong> use forwarded email content to
            train, fine-tune, or otherwise develop generalized
            machine-learning models, including large language models.
            AI extraction calls run against the message in-context per
            request and are not retained for training.
          </li>
          <li>
            We do <strong>not</strong> sell, license, or transfer
            forwarded email content to any third party, except the
            sub-processors necessary to operate the Service (Resend
            for inbound webhook delivery, Anthropic for AI extraction,
            Supabase for database storage) and only under contractual
            obligations that mirror these restrictions.
          </li>
          <li>
            Humans at CloseBoss do not read your forwarded email content
            except when (i) you give explicit written permission for
            specific messages, (ii) it is necessary for security or to
            prevent abuse, (iii) it is required for compliance with
            applicable law, or (iv) the content is first aggregated and
            anonymized in a way that cannot be used to identify you or
            your contacts.
          </li>
        </ul>

        <p className="font-semibold text-slate-900">Retention and deletion</p>
        <ul>
          <li>
            Forwarded email envelopes + body previews are retained in your
            CloseBoss CRM until you delete them, delete the associated
            review task, or delete your account. When your account is
            deleted, all inbound delivery records are removed or
            anonymized within 90 days, aligned with section 11 below.
          </li>
          <li>
            <strong>Stop forwarding</strong> at any time by disabling or
            deleting the Gmail / Outlook filter you set up. We have no
            way to pull emails from your inbox; we only receive what
            your filter sends.
          </li>
          <li>
            <strong>Rotate or disable your alias</strong> — visit
            Settings &rarr; Calendar &rarr; Email forwarding to rotate
            to a fresh alias, or contact us to disable inbound entirely.
          </li>
        </ul>

        <p className="font-semibold text-slate-900">Per-alias rate limit</p>
        <p>
          To deter abuse, each alias caps inbound deliveries at 100 per
          rolling 24 hours. Emails over the cap are dropped (we return
          200 to the upstream provider and discard). Volumes above this
          are extremely rare in normal use; raise a support request if
          your workflow needs a higher cap.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "6. How we share information",
    body: (
      <>
        <p>We share information only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> that help us operate the Service — hosting
            (Vercel, Supabase), SMS delivery (Twilio), email delivery (SendGrid / Resend),
            payments (Stripe), AI inference (OpenAI, Anthropic), analytics, and customer
            support tools.
          </li>
          <li>
            <strong>Your leads and contacts</strong> — messages you or CloseBoss send on
            your behalf disclose your identity to those recipients.
          </li>
          <li>
            <strong>Legal and safety</strong> — when required by law, subpoena, court
            order, or to protect the rights, property, or safety of CloseBoss, our users,
            or the public.
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger, acquisition,
            or sale of assets.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal information in exchange for monetary
          consideration. We also do not currently &ldquo;sell&rdquo; or &ldquo;share&rdquo;
          personal information as those terms are defined under CCPA/CPRA — including for
          cross-context behavioral advertising. We do not load advertising trackers
          (Facebook Pixel, Google Ads conversion tracking, TikTok Pixel, LinkedIn
          Insight, etc.) on the Service. If we ever change this practice we will update
          this policy and post the &ldquo;Do Not Sell or Share My Personal
          Information&rdquo; control described in section 9 before the new use begins.
        </p>
      </>
    ),
  },
  {
    id: "sms-email-compliance",
    title: "7. SMS and email compliance",
    body: (
      <>
        <p className="font-semibold text-slate-900">
          For end-user SMS recipients (homeowners, leads, and contacts)
        </p>
        <p>
          If you opt in to receive marketing text messages from CloseBoss AI via a
          consent checkbox on a CloseBoss public surface (for example{" "}
          <Link href="/contact" className="text-[#0072ce] hover:underline">
            /contact
          </Link>
          ,{" "}
          <Link href="/home-value-funnel" className="text-[#0072ce] hover:underline">
            /home-value-funnel
          </Link>
          , or{" "}
          <Link href="/open-house-signup" className="text-[#0072ce] hover:underline">
            /open-house-signup
          </Link>
          ), the mobile phone number you provide and your SMS opt-in record are
          used solely to deliver the marketing text messages you authorized at the
          moment of opt-in.
        </p>
        <p>
          We do <strong>not</strong> sell, rent, lease, share, transfer, or
          otherwise disclose your mobile phone number or SMS opt-in data to any
          third party or affiliate for their own marketing, promotional, or
          commercial purposes. Mobile information collected through SMS opt-in is
          excluded from all data-sharing arrangements with third parties, except
          where strictly necessary to deliver the messages you requested (e.g. our
          SMS provider, Twilio) and only for that delivery purpose.
        </p>
        <p>
          You may opt out at any time by replying <strong>STOP</strong> to any text
          message. For help, reply <strong>HELP</strong>. Message frequency varies.
          Message and data rates may apply. Consent is not a condition of any
          purchase. The four-element disclosure shown beneath the consent checkbox
          on each opt-in surface defines the exact terms at the moment of opt-in;
          that wording is pinned per surface and stored in our audit log so the
          exact text shown at the time of opt-in can be reproduced on request.
        </p>
        <p className="font-semibold text-slate-900">
          For CloseBoss customers (agents sending on behalf of their own contacts)
        </p>
        <p>
          CloseBoss sends SMS and email on your behalf only when consent has been
          established. By using the Service, you represent and warrant that:
        </p>
        <ul>
          <li>
            You have obtained prior express written consent (as required by the Telephone
            Consumer Protection Act, 47 U.S.C. § 227, and FCC rules) from every recipient
            before a marketing SMS is sent on your behalf.
          </li>
          <li>
            For non-marketing SMS (informational / transactional), you have a legitimate
            business relationship with the recipient.
          </li>
          <li>
            Every marketing email complies with the CAN-SPAM Act, including an unsubscribe
            link and accurate sender identification.
          </li>
          <li>
            You will honor STOP / UNSUBSCRIBE / HELP requests immediately — CloseBoss
            automatically suppresses these numbers and addresses on your behalf, but
            compliance is ultimately your responsibility.
          </li>
        </ul>
        <p>
          For 10DLC sender / caller allocation: CloseBoss maintains a registered
          10DLC brand and campaign with The Campaign Registry (TCR) and operates
          the SMS sending infrastructure as the messaging vendor. You remain the
          &ldquo;caller&rdquo; under the TCPA and the &ldquo;sender&rdquo; under
          the CAN-SPAM Act, which means consent capture and message content are
          your responsibility. Section 6 of the{" "}
          <Link href="/terms#sms-email-compliance" className="text-[#0072ce] hover:underline">
            Terms of Service
          </Link>{" "}
          spells this out in detail, including the option to bring your own
          10DLC brand for enterprise use cases.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "8. Cookies and tracking",
    body: (
      <>
        <p>
          We use cookies and similar technologies to keep you signed in, remember
          preferences, measure usage, and improve the Service. You can control cookies
          through your browser settings. Blocking essential cookies will break functions
          like staying signed in.
        </p>
        <p className="font-semibold text-slate-900">Categories of cookies we use</p>
        <ul>
          <li>
            <strong>Strictly necessary</strong> — authentication, session integrity,
            security, fraud prevention, load balancing. These are always active; the
            Service does not function without them.
          </li>
          <li>
            <strong>Functional</strong> — remember preferences (language, sidebar
            state, last-viewed contact). Disabling these works, but you&rsquo;ll
            re-enter preferences on each visit.
          </li>
          <li>
            <strong>Analytics</strong> — aggregate usage measurement to help us
            understand which features are useful. These are gated on your explicit
            opt-in; the Service ships zero analytics payloads to third parties until
            you grant consent.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> use advertising or cross-context tracking
          cookies. EU and California visitors see a consent banner controlling the
          analytics category; you can change your choice at any time from the cookie
          preferences link in the footer.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "9. Your rights",
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
            information as defined under CCPA/CPRA (even though we do not believe we
            engage in either).
          </li>
        </ul>
        <p>
          To exercise any of these rights, email{" "}
          <a
            href="mailto:contact@closebossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>
          . We will respond within the timeframes required by applicable law.
        </p>
        <p className="font-semibold text-slate-900">
          California &mdash; Do Not Sell or Share My Personal Information
        </p>
        <p>
          As described in section 6, we do not currently &ldquo;sell&rdquo; or
          &ldquo;share&rdquo; personal information under CCPA/CPRA. To submit a
          Do-Not-Sell-or-Share request anyway (it will be honored as a
          forward-looking opt-out), email{" "}
          <a
            href="mailto:contact@closebossai.com?subject=Do%20Not%20Sell%20or%20Share%20My%20Personal%20Information"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>{" "}
          with the subject line &ldquo;Do Not Sell or Share My Personal
          Information.&rdquo; You may also designate an authorized agent to make
          the request on your behalf in accordance with CCPA/CPRA procedures.
        </p>

        <p className="font-semibold text-slate-900">
          European Economic Area, United Kingdom, Switzerland
        </p>
        <p>
          If you are located in the EEA, the UK, or Switzerland, you may lodge a
          complaint with your local data protection authority. A current list of
          EEA Data Protection Authorities is available at{" "}
          <a
            href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en"
            className="text-[#0072ce] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            edpb.europa.eu/about-edpb/about-edpb/members
          </a>
          . UK residents may contact the Information Commissioner&rsquo;s Office
          (ICO) at{" "}
          <a
            href="https://ico.org.uk"
            className="text-[#0072ce] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            ico.org.uk
          </a>
          . You may also contact us first at{" "}
          <a
            href="mailto:contact@closebossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>
          , and we will respond within applicable legal timeframes.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "10. Retention",
    body: (
      <>
        <p>
          We keep personal information for as long as your account is active and for a
          reasonable period afterward to handle support issues, enforce agreements, and
          comply with law. When your account is deleted we remove or anonymize personal
          information within 90 days, except where retention is required for legal,
          accounting, or fraud-prevention purposes.
        </p>
        <p className="font-semibold text-slate-900">
          Retention by category
        </p>
        <ul>
          <li>
            <strong>Account + profile data</strong> — kept while your account is active;
            removed or anonymized within 90 days after account deletion.
          </li>
          <li>
            <strong>Contact records you upload</strong> (CRM contacts, leads, notes) —
            kept while your account is active; deleted within 90 days after account
            deletion. You can delete individual contacts at any time.
          </li>
          <li>
            <strong>SMS + email logs (including TCPA / CAN-SPAM consent records and
            opt-out evidence)</strong> — retained for at least 4 years after the last
            communication, in line with the TCPA statute of limitations and the FCC
            consent-recordkeeping standard.
          </li>
          <li>
            <strong>Gmail-synced messages</strong> (when Gmail sync is connected) — see
            section 5 (Google user data); retained until you delete the message, the
            associated contact, or your account.
          </li>
          <li>
            <strong>Billing + tax records</strong> — retained for at least 7 years for
            tax and audit compliance.
          </li>
          <li>
            <strong>Behavioral / usage logs</strong> — retained for up to 13 months,
            then aggregated or deleted.
          </li>
          <li>
            <strong>AI inference logs</strong> (the request/response sent to OpenAI or
            Anthropic) — held no longer than 30 days on the provider side per their
            terms; we do not retain a separate copy beyond what is necessary to render
            the resulting output to you.
          </li>
          <li>
            <strong>Security + audit logs</strong> — up to 24 months, retained longer
            only when actively needed for an investigation.
          </li>
          <li>
            <strong>Backups</strong> — encrypted backups roll off on a 35-day cycle.
            Deleted records are removed from active systems immediately and from
            backups as the backup cycle completes.
          </li>
        </ul>
        <p>
          Where a longer retention is required by law (subpoena, ongoing audit, fraud
          investigation, regulatory hold), we retain only the minimum data required and
          for only as long as the obligation persists.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "11. Security",
    body: (
      <>
        <p>
          We apply industry-standard administrative, technical, and physical safeguards,
          including encryption in transit (TLS) and at rest, access controls, audit
          logging, and regular security reviews. No method of transmission or storage is
          100% secure, but we work to protect your information and promptly investigate
          and address incidents.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "12. Children",
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
    title: "13. Changes to this policy",
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be
          notified via email or a prominent notice in the Service at least 30 days before
          they take effect. The &ldquo;last updated&rdquo; date at the top of this page
          always reflects the current version.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "14. Contact",
    body: (
      <>
        <p>
          Questions about this Privacy Policy can be directed to{" "}
          <a
            href="mailto:contact@closebossai.com"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
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

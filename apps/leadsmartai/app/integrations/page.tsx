import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  CreditCard,
  FileSignature,
  Globe2,
  MessageCircle,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Every integration RealtorBoss ships with — lead sources (Zillow, Facebook, IDX), email + calendar (Google, Microsoft), telephony (Twilio), e-signature (Dotloop, DocuSign), billing (Stripe), and more.",
  alternates: { canonical: "/integrations" },
  openGraph: {
    title: "Integrations — RealtorBoss",
    description:
      "Lead sources, calendar, email, telephony, e-signature, billing, and AI — everything RealtorBoss connects to.",
    url: "/integrations",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Integrations — RealtorBoss",
    description:
      "Every integration RealtorBoss ships with — across lead sources, calendar, telephony, e-signature, billing, and AI.",
  },
};

type Status = "live" | "beta" | "coming-soon";

type Integration = {
  name: string;
  description: string;
  status: Status;
  /** Optional deep link into setup or a help guide. */
  href?: string;
};

type Category = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: Integration[];
};

const CATEGORIES: Category[] = [
  {
    id: "lead-sources",
    title: "Lead sources",
    description:
      "Pull new leads in from every channel — portals, social ads, your own website. Everything flows through AI follow-up automatically.",
    icon: Globe2,
    items: [
      {
        name: "Zillow Premier Agent",
        description:
          "Connect your Zillow account so new buyer / seller inquiries land in the Lead Queue within seconds and trigger AI follow-up.",
        status: "live",
      },
      {
        name: "Realtor.com",
        description:
          "Sync new Realtor.com leads with the same routing rules as Zillow. Source attribution is preserved on every contact.",
        status: "live",
      },
      {
        name: "Facebook Lead Ads",
        description:
          "Run Meta lead ads and feed responses straight into LeadSmart. Custom field mapping for buyer / seller / open-house forms.",
        status: "live",
      },
      {
        name: "IDX website webhook",
        description:
          "One-line embed for any IDX site (Sierra, kvCORE, custom WordPress) — new form submissions hit LeadSmart in under a second.",
        status: "live",
      },
      {
        name: "Google Local Service Ads",
        description:
          "Pipe Google LSA inquiries into the same AI follow-up sequences as your portal leads.",
        status: "beta",
      },
      {
        name: "Open-house QR signup",
        description:
          "Native open-house signup page — visitors scan a QR code and land in your CRM with auto-tagging and source attribution.",
        status: "live",
      },
    ],
  },
  {
    id: "calendar-email",
    title: "Calendar & email",
    description:
      "Two-way sync with the calendar and inbox you already live in. Every appointment, sent message, and reply lands on the contact timeline.",
    icon: Calendar,
    items: [
      {
        name: "Google Workspace",
        description:
          "Two-way calendar sync, Gmail thread attachment, OAuth-based sending so your replies come from your real email address.",
        status: "live",
      },
      {
        name: "Microsoft 365 / Outlook",
        description:
          "Calendar + email sync with the same OAuth pattern as Google. Your Outlook events appear on the LeadSmart calendar.",
        status: "live",
      },
      {
        name: "Apple iCloud Calendar",
        description:
          "Read-only sync via CalDAV so you can see Apple-calendar events alongside LeadSmart bookings.",
        status: "coming-soon",
      },
    ],
  },
  {
    id: "telephony",
    title: "Voice & SMS",
    description:
      "Twilio powers every call and text — dialer, missed-call text-back, AI voice answering, and the carrier-registered SMS pipeline.",
    icon: Phone,
    items: [
      {
        name: "Twilio voice",
        description:
          "Click-to-call dialer + AI voice answering for inbound. Calls are recorded, transcribed, and summarized on the contact record.",
        status: "live",
      },
      {
        name: "Twilio SMS (A2P 10DLC)",
        description:
          "Carrier-registered SMS pipeline with high daily throughput. Powers missed-call text-back, AI follow-up, and template sends.",
        status: "live",
      },
      {
        name: "WhatsApp Business",
        description:
          "Same AI follow-up flow, routed through WhatsApp Business — useful for international clients and Chinese-American buyers.",
        status: "beta",
      },
      {
        name: "WeChat Official Account",
        description:
          "Native WeChat OA integration for agents serving Chinese-speaking clients. Bilingual templates ship with the platform.",
        status: "beta",
      },
    ],
  },
  {
    id: "esignature",
    title: "E-signature",
    description:
      "Send Buyer Broker Agreements, offers, and listing agreements for signature without leaving the deal record.",
    icon: FileSignature,
    items: [
      {
        name: "Dotloop",
        description:
          "Send the Buyer Broker Agreement, listing agreement, or offer for signature from any deal. Status flips on the deal record when the recipient signs.",
        status: "live",
      },
      {
        name: "DocuSign",
        description:
          "Alternate e-signature provider with the same workflow as Dotloop. Pick once in Settings; templates port over.",
        status: "live",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    description:
      "Stripe powers checkout, subscription management, and proration. Update payment methods and download invoices self-serve.",
    icon: CreditCard,
    items: [
      {
        name: "Stripe",
        description:
          "All plans, proration, payment-method swaps, and invoice history. ACH supported on Premium and Team plans.",
        status: "live",
      },
    ],
  },
  {
    id: "ai",
    title: "AI providers",
    description:
      "AI-generated replies, drafts, and analysis are powered by frontier models. The provider stack is transparent and swappable.",
    icon: Sparkles,
    items: [
      {
        name: "Anthropic Claude",
        description:
          "Primary model for AI follow-up drafting, voice AI conversation, deal coach reasoning, and the AI CMA analyzer.",
        status: "live",
      },
      {
        name: "OpenAI GPT",
        description:
          "Secondary model used as a fallback and for image-aware tasks (listing photo analysis, CMA imagery).",
        status: "live",
      },
    ],
  },
  {
    id: "automation",
    title: "Automation & developer access",
    description:
      "Connect LeadSmart to anything via webhooks or general-purpose automation platforms.",
    icon: MessageCircle,
    items: [
      {
        name: "Zapier",
        description:
          "Standard Zapier app — trigger on New lead, New conversation, Deal stage change, and act with Send template, Create task, Update contact.",
        status: "beta",
      },
      {
        name: "Make.com",
        description:
          "Make.com scenario support with the same triggers and actions as Zapier.",
        status: "coming-soon",
      },
      {
        name: "Custom webhooks",
        description:
          "POST any event from LeadSmart to your own endpoint, or accept inbound webhooks to create leads / contacts / tasks from external systems.",
        status: "live",
      },
    ],
  },
];

const STATUS_STYLES: Record<
  Status,
  { label: string; className: string }
> = {
  live: {
    label: "Live",
    className:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900/40",
  },
  beta: {
    label: "Beta",
    className:
      "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900/40",
  },
  "coming-soon": {
    label: "Coming soon",
    className:
      "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
};

const SITE_URL = "https://realtybossai.com";

export default function IntegrationsPage() {
  const total = CATEGORIES.reduce((sum, c) => sum + c.items.length, 0);
  const live = CATEGORIES.reduce(
    (sum, c) => sum + c.items.filter((i) => i.status === "live").length,
    0,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "RealtorBoss Integrations",
    url: `${SITE_URL}/integrations`,
    description:
      "Every integration RealtorBoss ships with — lead sources, calendar, email, telephony, e-signature, billing, and AI.",
    hasPart: CATEGORIES.flatMap((c) =>
      c.items.map((i) => ({
        "@type": "SoftwareApplication",
        name: i.name,
        applicationCategory: c.title,
        description: i.description,
      })),
    ),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            Integrations
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            LeadSmart fits into the workflow you already have.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            {live} live integrations and {total - live} more in beta or
            coming soon — across lead sources, calendar, email,
            telephony, e-signature, billing, and AI.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t see what you need?{" "}
            <Link
              href="/contact?topic=integration-request"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              Ask us
            </Link>{" "}
            — we ship requested integrations on a 2-week cadence.
          </p>
        </header>

        <nav aria-label="Integration categories" className="mt-10">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-900/50 dark:hover:bg-slate-900/60"
                >
                  {c.title}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({c.items.length})
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-14">
          {CATEGORIES.map((category) => (
            <section
              key={category.id}
              id={category.id}
              className="scroll-mt-24"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <category.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
                    {category.title}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {category.description}
                  </p>
                </div>
              </div>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.items.map((integration) => (
                  <li key={integration.name}>
                    <IntegrationCard integration={integration} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center md:p-10 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 md:text-2xl dark:text-white">
            Missing an integration you need?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            We ship one new integration every other week, prioritized by
            paying-customer demand. Tell us what you need and we&apos;ll
            tell you when it&apos;s landing.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact?topic=integration-request"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Request an integration
            </Link>
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Start free trial
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const styles = STATUS_STYLES[integration.status];
  const body = (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {integration.name}
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles.className}`}
        >
          {styles.label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {integration.description}
      </p>
    </div>
  );
  if (integration.href) {
    return (
      <Link href={integration.href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}

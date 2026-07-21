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
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const ti = (key: string): string => t(key, { ns: "web_integrations" });
  return {
    title: ti("meta.title"),
    description: ti("meta.description"),
    alternates: { canonical: "/integrations" },
    openGraph: {
      title: ti("meta.og_title"),
      description: ti("meta.og_description"),
      url: "/integrations",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ti("meta.twitter_title"),
      description: ti("meta.twitter_description"),
    },
  };
}

type Status = "live" | "beta" | "coming-soon";

type Integration = {
  /** Translation key under `categories.<cat>.items.<key>`. */
  key: string;
  status: Status;
  /** Optional deep link into setup or a help guide. */
  href?: string;
};

type Category = {
  id: string;
  /** Translation key under `categories.<key>`. */
  tKey: string;
  icon: LucideIcon;
  items: Integration[];
};

const CATEGORIES: Category[] = [
  {
    id: "lead-sources",
    tKey: "lead_sources",
    icon: Globe2,
    items: [
      { key: "zillow", status: "live" },
      { key: "realtor", status: "live" },
      { key: "facebook", status: "live" },
      { key: "idx", status: "live" },
      { key: "google_lsa", status: "beta" },
      { key: "open_house_qr", status: "live" },
    ],
  },
  {
    id: "calendar-email",
    tKey: "calendar_email",
    icon: Calendar,
    items: [
      { key: "google", status: "live" },
      { key: "microsoft", status: "live" },
      { key: "apple", status: "coming-soon" },
    ],
  },
  {
    id: "telephony",
    tKey: "telephony",
    icon: Phone,
    items: [
      { key: "twilio_voice", status: "live" },
      { key: "twilio_sms", status: "live" },
      { key: "whatsapp", status: "beta" },
      { key: "wechat", status: "beta" },
    ],
  },
  {
    id: "esignature",
    tKey: "esignature",
    icon: FileSignature,
    items: [
      { key: "dotloop", status: "live" },
      { key: "docusign", status: "live" },
    ],
  },
  {
    id: "billing",
    tKey: "billing",
    icon: CreditCard,
    items: [{ key: "stripe", status: "live" }],
  },
  {
    id: "ai",
    tKey: "ai",
    icon: Sparkles,
    items: [
      { key: "anthropic", status: "live" },
      { key: "openai", status: "live" },
    ],
  },
  {
    id: "automation",
    tKey: "automation",
    icon: MessageCircle,
    items: [
      { key: "zapier", status: "beta" },
      { key: "make", status: "coming-soon" },
      { key: "webhooks", status: "live" },
    ],
  },
];

const STATUS_TKEY: Record<Status, string> = {
  live: "status.live",
  beta: "status.beta",
  "coming-soon": "status.coming_soon",
};

const STATUS_CLASS: Record<Status, string> = {
  live: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900/40",
  beta: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900/40",
  "coming-soon":
    "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

const SITE_URL = "https://closebossai.com";

export default async function IntegrationsPage() {
  const t = await getServerT();
  const ti = (key: string, opts?: Record<string, unknown>): string =>
    t(key, { ns: "web_integrations", ...opts });

  const total = CATEGORIES.reduce((sum, c) => sum + c.items.length, 0);
  const live = CATEGORIES.reduce(
    (sum, c) => sum + c.items.filter((i) => i.status === "live").length,
    0,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CloseBoss Integrations",
    url: `${SITE_URL}/integrations`,
    description:
      "Every integration CloseBoss ships with — lead sources, calendar, email, telephony, e-signature, billing, and AI.",
    hasPart: CATEGORIES.flatMap((c) =>
      c.items.map((i) => ({
        "@type": "SoftwareApplication",
        name: ti(`categories.${c.tKey}.items.${i.key}.name`),
        applicationCategory: ti(`categories.${c.tKey}.title`),
        description: ti(`categories.${c.tKey}.items.${i.key}.description`),
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
            {ti("header.eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            {ti("header.h1")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            {ti("header.summary", { live, rest: total - live })}
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {ti("header.ask_pre")}
            <Link
              href="/contact?topic=integration-request"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              {ti("header.ask_link")}
            </Link>
            {ti("header.ask_post")}
          </p>
        </header>

        <nav aria-label={ti("header.nav_a11y")} className="mt-10">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-900/50 dark:hover:bg-slate-900/60"
                >
                  {ti(`categories.${c.tKey}.title`)}{" "}
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
                    {ti(`categories.${category.tKey}.title`)}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {ti(`categories.${category.tKey}.description`)}
                  </p>
                </div>
              </div>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.items.map((integration) => (
                  <li key={integration.key}>
                    <IntegrationCard
                      integration={integration}
                      name={ti(`categories.${category.tKey}.items.${integration.key}.name`)}
                      description={ti(
                        `categories.${category.tKey}.items.${integration.key}.description`,
                      )}
                      statusLabel={ti(STATUS_TKEY[integration.status])}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center md:p-10 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 md:text-2xl dark:text-white">
            {ti("cta.h2")}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {ti("cta.body")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact?topic=integration-request"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {ti("cta.request")}
            </Link>
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              {ti("cta.start_free")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  name,
  description,
  statusLabel,
}: {
  integration: Integration;
  name: string;
  description: string;
  statusLabel: string;
}) {
  const body = (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {name}
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CLASS[integration.status]}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {description}
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

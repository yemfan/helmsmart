import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Headphones,
  Megaphone,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  FEATURE_PAGES,
  getFeaturePageBySlug,
  type FeatureIcon,
} from "@/lib/marketing/features";
import { getSiteUrl } from "@/lib/siteUrl";
import { getServerT } from "@/lib/i18n/server";

const PRIMARY_CTA_HREF = "/onboarding";
const BRAND = "#0072ce";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  receptionist: Headphones,
  sales: TrendingUp,
  marketing: Megaphone,
  transaction: ClipboardList,
  cma: BarChart3,
};

export function generateStaticParams() {
  return FEATURE_PAGES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeaturePageBySlug(slug);
  if (!feature) return {};
  return {
    title: feature.metaTitle,
    description: feature.metaDescription,
    keywords: feature.keywords,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: {
      title: feature.metaTitle,
      description: feature.metaDescription,
      url: `/features/${feature.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: feature.metaTitle,
      description: feature.metaDescription,
    },
  };
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getServerT();
  const { slug } = await params;
  const feature = getFeaturePageBySlug(slug);
  if (!feature) return notFound();

  const Icon = ICONS[feature.icon];
  const base = getSiteUrl().replace(/\/$/, "");
  const url = `${base}/features/${feature.slug}`;

  // FAQPage + BreadcrumbList structured data. The FAQ text mirrors the visible
  // Q&A below (Google requires parity) so these can surface as rich results and
  // feed the AI Overview clean, quotable answers about each product.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: feature.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Features", item: `${base}/features` },
        { "@type": "ListItem", position: 2, name: feature.name, item: url },
      ],
    },
  ];

  const related = feature.related
    .map((s) => getFeaturePageBySlug(s))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={`ld-${i}`}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {/* ── HERO ── */}
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-slate-50 via-white to-white px-6 py-20 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 md:py-24">
        <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
          <div
            className="absolute left-1/2 top-0 h-[440px] w-[760px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.12] blur-[100px] dark:opacity-[0.08]"
            style={{
              background:
                "conic-gradient(from 180deg at 50% 50%, #0072ce 0deg, #4F46E5 120deg, #0072ce 240deg, #7c3aed 360deg)",
            }}
          />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          {/* Breadcrumb (visible, matches BreadcrumbList schema) */}
          <nav className="mb-6 text-sm text-slate-500 dark:text-slate-400" aria-label={t("pages.articleChrome.breadcrumb", { ns: "dashboard" })}>
            <Link href="/features" className="hover:text-[#0072ce] hover:underline">
              Features
            </Link>
            <span className="mx-2" aria-hidden>
              /
            </span>
            <span className="text-slate-700 dark:text-slate-300">{feature.name}</span>
          </nav>

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
            <Icon size={26} aria-hidden />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">
            {feature.eyebrow}
          </p>
          <h1 className="mt-3 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-950 md:text-5xl dark:text-white">
            {feature.h1}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-400">
            {feature.intro}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0072ce] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-[#0072ce]/20 transition hover:bg-[#005ba8] hover:shadow-xl"
            >
              Start free
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="px-6 py-18 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-heading text-2xl font-bold text-slate-900 md:text-3xl dark:text-white">
            What {feature.name} does for you
          </h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {feature.benefits.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                <span className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-y border-slate-200/80 bg-slate-50/70 px-6 py-18 dark:border-slate-800 dark:bg-slate-900/30 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-heading text-2xl font-bold text-slate-900 md:text-3xl dark:text-white">
            How it works
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {feature.steps.map((s, i) => (
              <div
                key={s.title}
                className="relative h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0072ce] text-sm font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-slate-900 dark:text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-6 py-18 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-heading text-2xl font-bold text-slate-900 md:text-3xl dark:text-white">{t("pages.articleChrome.faqLong", { ns: "dashboard" })}</h2>
          <dl className="mt-10 space-y-4">
            {feature.faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <dt className="font-heading text-base font-semibold text-slate-900 dark:text-white">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── RELATED FEATURES (internal linking) ── */}
      {related.length > 0 ? (
        <section className="border-t border-slate-200/80 px-6 py-16 dark:border-slate-800">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center font-heading text-xl font-bold text-slate-900 md:text-2xl dark:text-white">
              Meet the rest of the team
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {related.map((r) => {
                const RIcon = ICONS[r.icon];
                return (
                  <Link
                    key={r.slug}
                    href={`/features/${r.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0072ce] dark:bg-blue-900/30 dark:text-[#4da3e8]">
                      <RIcon size={20} aria-hidden />
                    </div>
                    <h3 className="mt-4 font-heading text-sm font-bold text-slate-900 dark:text-white">
                      {r.name}
                    </h3>
                    <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#0072ce] dark:text-[#4da3e8]">
                      Learn more
                      <ArrowRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── FINAL CTA ── */}
      <section className="px-6 pb-20 pt-4 md:pb-24">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] px-8 py-14 text-center text-white shadow-2xl md:px-12">
          <h2 className="font-heading text-2xl font-bold leading-tight md:text-3xl">
            Put your AI real estate team to work
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 md:text-lg">
            {feature.name} is one member of the CloseBoss team — answering calls, following up,
            marketing, and coordinating deals so you can focus on closing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={PRIMARY_CTA_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold shadow-lg transition hover:bg-slate-50 md:text-base"
              style={{ color: BRAND }}
            >
              Start free
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 md:text-base"
            >
              See all features
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

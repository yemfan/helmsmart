import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  assembleIssue,
  resolveRegion,
  type NewsletterIssue,
} from "@/lib/newsletter/assembleIssue";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ region: string; week: string }> };

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatWeek(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

async function loadIssue(
  region: string,
  week: string,
): Promise<NewsletterIssue | null> {
  if (!WEEK_RE.test(week)) return null;
  try {
    return await assembleIssue(region, week);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region, week } = await params;
  const base = getSiteUrl();

  // Metadata only needs the region name + week; resolve them independently so an
  // unknown region/week still yields a sane (non-throwing) title.
  let regionName = "U.S.";
  if (WEEK_RE.test(week)) {
    try {
      const r = await resolveRegion(region);
      if (r) regionName = r.name;
    } catch {
      /* fall back to U.S. */
    }
  }
  const weekLabel = WEEK_RE.test(week) ? formatWeek(week) : week;
  const title = `${regionName} Housing & Rates — Week of ${weekLabel} | RealtyBoss`;
  const description = `The week of ${weekLabel} in mortgage rates and the housing market, in plain English — paired with the latest ${regionName} market snapshot. Every figure linked to its source.`;

  return {
    title,
    description,
    alternates: { canonical: `${base}/newsletter/${region}/${week}` },
    openGraph: {
      title,
      description,
      url: `${base}/newsletter/${region}/${week}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function NewsletterIssuePage({ params }: Props) {
  const { region, week } = await params;
  const issue = await loadIssue(region, week);
  if (!issue) notFound();

  const { digest, region: reg, weekOf } = issue;
  const base = getSiteUrl();
  const weekLabel = formatWeek(weekOf);
  const items = Array.isArray(digest.items) ? digest.items : [];
  const sources = Array.isArray(digest.sources) ? digest.sources : [];

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "RealtyBoss", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Weekly Newsletter", item: `${base}/newsletter` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${reg.name} — Week of ${weekLabel}`,
        item: `${base}/newsletter/${region}/${weekOf}`,
      },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${reg.name} Housing & Rates — Week of ${weekLabel}`,
    description: digest.intro ?? undefined,
    datePublished: weekOf,
    url: `${base}/newsletter/${region}/${weekOf}`,
    author: { "@type": "Organization", name: "RealtyBoss" },
    publisher: { "@type": "Organization", name: "RealtyBoss" },
    isBasedOn: sources.map((sc) => sc.url),
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={articleJsonLd} />

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
            RealtyBoss
          </Link>
          <span className="mx-2 text-slate-400">/</span>
          <Link href="/newsletter" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
            Weekly Newsletter
          </Link>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-600">
            {reg.name} — Week of {weekLabel}
          </span>
        </nav>

        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">
            Week of {weekLabel} · {reg.name}
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">{digest.title}</h1>
          {digest.intro && (
            <p className="max-w-2xl text-lg leading-relaxed text-slate-600">{digest.intro}</p>
          )}
        </header>

        {/* Regional market snapshot */}
        <section aria-label="Regional market snapshot" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-bold text-slate-900">
              {reg.name} market snapshot
            </h2>
            <Link
              href={reg.dataHref}
              className="text-sm font-semibold text-[#0072ce] hover:text-[#005ca8]"
            >
              Full data →
            </Link>
          </div>
          {reg.stats.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Market data for {reg.name} is being refreshed. Check back soon.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {reg.stats.map((st) => (
                <div
                  key={st.metric}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {st.short}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{st.formatted}</p>
                  {st.periodLabel && (
                    <p className="mt-1 text-xs text-slate-400">{st.periodLabel}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* National digest items */}
        <section aria-label="This week in rates and housing" className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">This week in rates &amp; housing</h2>
          <div className="space-y-4">
            {items.map((it, i) => (
              <article
                key={i}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03]"
              >
                <h3 className="text-lg font-semibold leading-snug text-slate-900">
                  {it.headline}
                </h3>
                {it.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{it.summary}</p>
                )}
                {it.why_it_matters && (
                  <p className="mt-3 rounded-lg bg-[#0072ce]/5 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    <span className="font-semibold text-[#0072ce]">What it means for you: </span>
                    {it.why_it_matters}
                  </p>
                )}
                {it.source_url && (
                  <p className="mt-3 text-xs text-slate-500">
                    Source:{" "}
                    <a
                      href={it.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#0072ce] hover:underline"
                    >
                      {it.publisher || it.source_url}
                    </a>
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Sources */}
        {sources.length > 0 && (
          <section aria-label="Sources" className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">Sources</h2>
            <ul className="space-y-1 text-sm">
              {sources.map((sc, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-slate-400">·</span>
                  <a
                    href={sc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0072ce] hover:underline"
                  >
                    {sc.title || sc.url}
                    {sc.publisher ? ` — ${sc.publisher}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500">
          RealtyBoss publishes this briefing weekly. Numbers are pulled from the
          cited public sources; the {reg.name} snapshot comes from the RealtyBoss
          Data Center.{" "}
          <Link href="/newsletter" className="font-medium text-[#0072ce] hover:underline">
            Subscribe or browse past issues →
          </Link>
        </footer>
      </div>
    </main>
  );
}

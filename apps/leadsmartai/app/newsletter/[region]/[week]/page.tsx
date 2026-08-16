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
import {
  CATEGORY_LABEL,
  coerceCategory,
  coerceKeyPoint,
  coerceState,
  type DigestItem,
} from "@/lib/newsletter/generateDigest";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ region: string; week: string }> };

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatWeek(d: string, locale: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
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
  const locale = intlLocale(await getServerLocale());
  const weekLabel = WEEK_RE.test(week) ? formatWeek(week, locale) : week;
  const title = `${regionName} Housing & Rates — Week of ${weekLabel} | CloseBoss`;
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
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const { region, week } = await params;
  const issue = await loadIssue(region, week);
  if (!issue) notFound();

  const { digest, region: reg, weekOf } = issue;
  const base = getSiteUrl();
  const weekLabel = formatWeek(weekOf, locale);
  const rawItems = Array.isArray(digest.items) ? digest.items : [];
  const sources = Array.isArray(digest.sources) ? digest.sources : [];

  // Defensively resolve category/state per item (legacy digests lack them) and
  // order for this region: items matching the region's state OR national items
  // come first, other-state items last. Nothing is dropped — only reordered.
  const regionState = reg.stateCode; // null for national
  const items = rawItems
    .map((it) => {
      const p = it as Partial<DigestItem>;
      const state = coerceState(p.state);
      const rawImg = typeof p.image_url === "string" ? p.image_url.trim() : "";
      return {
        ...it,
        category: coerceCategory(p.category),
        state,
        scope: state ? ("state" as const) : ("national" as const),
        // Defensive for legacy digests: derive key_point if absent, drop bad img.
        key_point: coerceKeyPoint(p.key_point, p.why_it_matters, p.summary),
        image_url: /^https?:\/\//i.test(rawImg) ? rawImg : null,
      };
    })
    .map((it, idx) => {
      // relevant = national item, or a state item matching this region's state.
      const relevant =
        it.scope === "national" || (regionState !== null && it.state === regionState);
      return { it, idx, rank: relevant ? 0 : 1 };
    })
    // Stable: within the same relevance bucket keep original digest order.
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map((x) => x.it);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "CloseBoss", item: `${base}/` },
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
    author: { "@type": "Organization", name: "CloseBoss" },
    publisher: { "@type": "Organization", name: "CloseBoss" },
    isBasedOn: sources.map((sc) => sc.url),
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={articleJsonLd} />

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
            CloseBoss
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

        {/* This-week-in-housing radar items */}
        <section aria-label="This week in housing" className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900">This week in housing</h2>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
            {items.map((it, i) => {
              const otherState =
                it.scope === "state" &&
                (regionState === null || it.state !== regionState);
              return (
                <article
                  key={i}
                  className={`p-6 sm:p-7 ${otherState ? "opacity-70" : ""}`}
                >
                  <div className="flex flex-col gap-5 sm:flex-row">
                    {it.image_url && (
                      <div className="sm:w-44 sm:flex-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.image_url}
                          alt=""
                          loading="lazy"
                          className="h-40 w-full rounded-xl object-cover ring-1 ring-slate-900/5 sm:h-28"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#0072ce]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0072ce]">
                          {CATEGORY_LABEL[it.category]}
                        </span>
                        {it.state && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {it.state}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold leading-snug text-slate-900">
                        {it.headline}
                      </h3>
                      {it.key_point && (
                        <p className="mt-2 flex gap-2 text-[15px] font-semibold leading-snug text-slate-900">
                          <span aria-hidden className="mt-[2px] text-[#0072ce]">
                            &bull;
                          </span>
                          <span>{it.key_point}</span>
                        </p>
                      )}
                      {it.why_it_matters && (
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          <span className="font-semibold text-slate-700">
                            What it means for you:{" "}
                          </span>
                          {it.why_it_matters}
                        </p>
                      )}
                      {it.source_url && (
                        <p className="mt-3 text-xs text-slate-500">
                          <a
                            href={it.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[#0072ce] hover:underline"
                          >
                            Read source →{it.publisher ? ` ${it.publisher}` : ""}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Sources */}
        {sources.length > 0 && (
          <section aria-label={t("pages.articleChrome.sources", { ns: "dashboard" })} className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">{t("pages.articleChrome.sources", { ns: "dashboard" })}</h2>
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
          CloseBoss publishes this briefing weekly. Numbers are pulled from the
          cited public sources; the {reg.name} snapshot comes from the CloseBoss
          Data Center.{" "}
          <Link href="/newsletter" className="font-medium text-[#0072ce] hover:underline">
            Subscribe or browse past issues →
          </Link>
        </footer>
      </div>
    </main>
  );
}

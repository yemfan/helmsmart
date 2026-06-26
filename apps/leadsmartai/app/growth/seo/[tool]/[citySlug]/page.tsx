import type { Metadata } from "next";
import Link from "next/link";
import { GROWTH_SEO_CITIES, GROWTH_SEO_TOOLS } from "@repo/growth";
import ProgressiveLeadCapture from "@/components/growth/ProgressiveLeadCapture";

type Props = { params: Promise<{ tool: string; citySlug: string }> };

export function generateStaticParams() {
  const params: { tool: string; citySlug: string }[] = [];
  for (const t of GROWTH_SEO_TOOLS) {
    for (const c of GROWTH_SEO_CITIES) {
      params.push({ tool: t.slug, citySlug: c.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool, citySlug } = await params;
  const t = GROWTH_SEO_TOOLS.find((x) => x.slug === tool);
  const c = GROWTH_SEO_CITIES.find((x) => x.slug === citySlug);
  const title = t && c ? `${t.name} in ${c.city}, ${c.state} | RealtyBoss` : "Tools | RealtyBoss";
  const description =
    t && c
      ? `Use our free ${t.name.toLowerCase()} for ${c.city}, ${c.state}. Local context, fast answers, mobile-friendly.`
      : "Free real estate calculators.";
  return { title, description, openGraph: { title, description } };
}

export default async function GrowthSeoPage({ params }: Props) {
  const { tool, citySlug } = await params;
  const t = GROWTH_SEO_TOOLS.find((x) => x.slug === tool);
  const c = GROWTH_SEO_CITIES.find((x) => x.slug === citySlug);
  if (!t || !c) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <p>Page not found.</p>
        <Link href="/" className="text-blue-700 text-sm">
          Home
        </Link>
      </div>
    );
  }

  const toolHref = `/${t.slug}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <article className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← RealtyBoss
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase text-slate-500">{t.category}</p>
          <h1 className="text-2xl font-bold mt-1 leading-tight">
            {t.name} in {c.city}, {c.state}
          </h1>
          <p className="text-slate-600 mt-3 text-sm leading-relaxed">
            Run numbers for the {c.city} market — compare scenarios, estimate payments, and plan your next
            move. Built for buyers, sellers, and investors.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 text-sm text-slate-700">
          <h2 className="font-bold text-slate-900">Why use this in {c.city}?</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Localized framing for {c.state} buyers comparing financing options.</li>
            <li>Shareable results you can send to your agent or lender.</li>
            <li>Mobile-first — run it on the go during tours.</li>
          </ul>
        </section>

        <Link
          href={toolHref}
          className="flex w-full items-center justify-center rounded-2xl bg-blue-600 text-white font-semibold py-3 text-sm"
        >
          Open {t.name} →
        </Link>

        <ProgressiveLeadCapture
          headline="Get matched with local guidance"
          source={`growth_seo:${tool}:${citySlug}`}
        />
      </article>
    </div>
  );
}

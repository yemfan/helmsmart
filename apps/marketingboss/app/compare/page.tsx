import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/marketing/PublicNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { COMPARISONS } from "@/lib/marketing/seoContent";

export const metadata: Metadata = {
  title: "How MarketingBoss compares",
  description:
    "Honest comparisons against the tools people evaluate alongside MarketingBoss — including where the other tool is the better choice.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "How MarketingBoss compares",
    description: "Where MarketingBoss fits against schedulers, management platforms and design tools.",
    url: "/compare",
    type: "website",
  },
};

export default function CompareIndexPage() {
  return (
    <>
      <PublicNav />
      <main className="mx-auto max-w-6xl px-5 py-14">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">Compare</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
            How MarketingBoss compares.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-3">
            Most tools in this space schedule content you already made. MarketingBoss makes the content and then
            schedules it. That difference matters a lot for some workflows and not at all for others — each page
            below says plainly when the other tool is the better pick.
          </p>
        </header>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="group rounded-2xl border border-line bg-white p-6 transition hover:border-boss-violet/40"
            >
              <h2 className="text-lg font-semibold text-ink group-hover:text-boss-violet">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{c.description}</p>
              <p className="mt-3 text-sm font-medium text-boss-violet">Read the comparison →</p>
            </Link>
          ))}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

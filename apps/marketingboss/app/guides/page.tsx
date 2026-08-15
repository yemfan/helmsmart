import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/marketing/PublicNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { GUIDES } from "@/lib/marketing/seoContent";

export const metadata: Metadata = {
  title: "Guides — social media publishing and AI creative",
  description:
    "Practical guides to scheduling, AI-generated creative, UGC-style ads, vertical video and building a posting cadence you can keep.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "MarketingBoss guides",
    description: "Practical guides to social publishing and AI-generated creative.",
    url: "/guides",
    type: "website",
  },
};

const CATEGORY_ORDER = ["Publishing", "Creative", "Strategy"] as const;

export default function GuidesIndexPage() {
  return (
    <>
      <PublicNav />
      <main className="mx-auto max-w-6xl px-5 py-14">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">Guides</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
            How to actually get content out the door.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-3">
            Everything here is written to be useful whether or not you use MarketingBoss — the platform rules,
            format constraints and cadence advice apply to any tool you publish with.
          </p>
        </header>

        {CATEGORY_ORDER.map((category) => {
          const inCategory = GUIDES.filter((g) => g.category === category);
          if (inCategory.length === 0) return null;
          return (
            <section key={category} className="mt-12">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-3">{category}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {inCategory.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/guides/${g.slug}`}
                    className="group rounded-2xl border border-line bg-white p-6 transition hover:border-boss-violet/40"
                  >
                    <h3 className="text-lg font-semibold text-ink group-hover:text-boss-violet">{g.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-3">{g.description}</p>
                    <p className="mt-3 text-sm font-medium text-boss-violet">Read the guide →</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
      <PublicFooter />
    </>
  );
}

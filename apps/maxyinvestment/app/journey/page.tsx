import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/section";
import { Timeline } from "@/components/timeline";
import { milestones } from "@/lib/content";

export const metadata: Metadata = {
  title: "Our Journey",
  description:
    "From residential home building in 2006 to AI ventures in 2026 — the milestones behind MAXY Investment Inc., across real estate, hospitality, technology, and artificial intelligence.",
  alternates: { canonical: "/journey" },
};

export default function JourneyPage() {
  return (
    <main id="main-content">
      <section className="bg-gradient-to-b from-white to-mist py-16 sm:py-24">
        <Container>
          <Eyebrow>Our Journey</Eyebrow>
          <h1 className="mt-2 mb-6 font-serif text-[clamp(2.75rem,7vw,4.75rem)] font-bold leading-[1.03] text-navy-800">
            From real estate and hospitality to intelligent businesses.
          </h1>
          <p className="max-w-[720px] text-lg text-navy-500">
            Every company has a beginning. Ours began long before artificial intelligence — with
            homes, buildings, and hotels. Each one taught lessons about operations, leadership, and
            long-term value creation that shape everything we build today.
          </p>
        </Container>
      </section>

      <section className="py-16 sm:py-[82px]">
        <Container>
          <Timeline items={milestones} />
        </Container>
      </section>

      {/* Closing hand-off — the journey explains the thesis; About states it. */}
      <section className="bg-navy-800 py-16 text-white sm:py-20">
        <Container>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-300">
            Where it leads
          </p>
          <p className="mt-3 mb-8 max-w-[760px] font-serif text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight">
            Two decades of operating experience, now applied to artificial intelligence.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/about"
              className="inline-block rounded-full bg-white px-6 py-3.5 font-bold text-navy-800 transition-colors hover:bg-navy-100"
            >
              Read our story
            </Link>
            <Link
              href="/contact"
              className="inline-block rounded-full border border-white/25 px-6 py-3.5 font-bold text-white transition-colors hover:border-white/60"
            >
              Start a conversation
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}

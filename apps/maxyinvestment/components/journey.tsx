import Link from "next/link";
import { Container, Eyebrow, SectionHeading } from "./section";

/**
 * Homepage teaser, not a timeline. The journey is told once, on /journey —
 * duplicating the milestones here would mean two versions of the same history.
 */
export function Journey() {
  return (
    <section id="journey" className="py-16 sm:py-[82px]">
      <Container>
        <Eyebrow>Our Journey</Eyebrow>
        <SectionHeading>From real estate and hospitality to intelligent businesses.</SectionHeading>
        <p className="max-w-[720px] text-lg text-navy-500">
          Nearly two decades across residential construction, commercial real estate, hospitality,
          and technology — each one shaping the companies we build today.
        </p>
        <Link
          href="/journey"
          className="mt-8 inline-block rounded-full bg-navy-800 px-6 py-3.5 font-bold text-white transition-colors hover:bg-navy-700"
        >
          See the full journey
        </Link>
      </Container>
    </section>
  );
}

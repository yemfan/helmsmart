import Link from "next/link";
import { company } from "@/lib/content";
import { Container, Eyebrow } from "./section";

export function Hero() {
  return (
    <section id="top" className="bg-gradient-to-b from-white to-mist py-16 sm:py-[90px]">
      <Container>
        <Eyebrow>Innovation Holding Company</Eyebrow>
        <h1 className="mt-2 mb-5 font-serif text-[clamp(3.125rem,8vw,5.75rem)] font-bold leading-none text-navy-800">
          Building intelligent businesses.
        </h1>
        <p className="max-w-[720px] text-lg text-navy-500 sm:text-xl">{company.description}</p>
        <Link
          href="/journey"
          className="mt-8 inline-block rounded-full bg-navy-800 px-6 py-3.5 font-bold text-white transition-colors hover:bg-navy-700"
        >
          View Our Journey
        </Link>
      </Container>
    </section>
  );
}

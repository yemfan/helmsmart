import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/section";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main id="main-content" className="bg-gradient-to-b from-white to-mist">
      <Container className="py-24 sm:py-32">
        <Eyebrow>404</Eyebrow>
        <h1 className="mt-2 mb-5 font-serif text-[clamp(2.5rem,6vw,4rem)] font-bold leading-none text-navy-800">
          This page doesn&rsquo;t exist.
        </h1>
        <p className="mb-8 max-w-[560px] text-lg text-navy-500">
          The link may be out of date, or the page may have moved. Everything we publish is
          reachable from the homepage.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-block rounded-full bg-navy-800 px-6 py-3.5 font-bold text-white transition-colors hover:bg-navy-700"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="inline-block rounded-full border border-line bg-white px-6 py-3.5 font-bold text-navy-800 transition-colors hover:border-navy-300"
          >
            Contact us
          </Link>
        </div>
      </Container>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, SectionHeading } from "@/components/section";
import { Timeline } from "@/components/timeline";
import { beliefs, company, detailedMilestones, leadership, portfolio } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "For nearly two decades our journey has spanned residential construction, commercial real estate, hospitality, and technology. Today MAXY Investment Inc. builds and scales intelligent businesses.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main id="main-content">
      {/* Opening — the thesis, stated once, plainly. */}
      <section className="bg-gradient-to-b from-white to-mist py-16 sm:py-24">
        <Container>
          <Eyebrow>About MAXY</Eyebrow>
          <h1 className="mt-2 mb-8 font-serif text-[clamp(2.75rem,7vw,4.75rem)] font-bold leading-[1.03] text-navy-800">
            Building intelligent businesses.
          </h1>

          <blockquote className="mb-10 border-l-4 border-brand-500 pl-6">
            <p className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-bold leading-snug text-navy-800">
              We don&rsquo;t simply invest in businesses. We build them.
            </p>
          </blockquote>

          <div className="max-w-[720px] space-y-5 text-lg text-navy-500">
            <p>
              For nearly two decades, our entrepreneurial journey has spanned residential
              construction, commercial real estate, hospitality, and technology. Today, MAXY
              Investment Inc. is focused on creating and scaling intelligent businesses powered by
              artificial intelligence, automation, and innovative operating models.
            </p>
            <p>
              Our experience as owners, operators, investors, and technology builders allows us to
              approach every opportunity from a practical business perspective rather than simply a
              technical one.
            </p>
          </div>
        </Container>
      </section>

      {/* Our Story — narrative, set wider and quieter than the rest. */}
      <section className="py-16 sm:py-[82px]">
        <Container>
          <Eyebrow>Our Story</Eyebrow>
          <SectionHeading>Every company has a beginning.</SectionHeading>

          <div className="max-w-[720px] space-y-5 text-lg text-navy-500">
            <p className="font-serif text-2xl font-bold text-navy-800">
              Ours began long before artificial intelligence.
            </p>
            <p>
              In 2006, we entered the residential home-building industry, learning firsthand how to
              create value through design, construction, and customer relationships.
            </p>
            <p>As our experience grew, so did our vision.</p>
            <p>
              We expanded into commercial real estate investment, hospitality ownership and
              management, and ultimately technology innovation.
            </p>
            <p>
              Each business taught valuable lessons about operations, leadership, customer service,
              finance, and long-term value creation.
            </p>
            <p className="font-semibold text-navy-800">
              Today, those experiences shape every company we build.
            </p>
          </div>
        </Container>
      </section>

      {/* Our Journey — the same history as the homepage, told venture by venture. */}
      <section id="journey" className="bg-mist py-16 sm:py-[82px]">
        <Container>
          <Eyebrow>Our Journey</Eyebrow>
          <SectionHeading>Two decades, five industries.</SectionHeading>
          <Timeline items={detailedMilestones} />
        </Container>
      </section>

      {/* What We Believe */}
      <section className="py-16 sm:py-[82px]">
        <Container>
          <Eyebrow>What We Believe</Eyebrow>
          <SectionHeading>Three convictions behind every company.</SectionHeading>

          <ul className="grid gap-6 md:grid-cols-3">
            {beliefs.map((belief, i) => (
              <li
                key={belief.title}
                className="rounded-2xl border border-line bg-white p-6 sm:p-7"
              >
                <span
                  aria-hidden
                  className="font-serif text-3xl font-bold text-brand-500/30"
                >
                  0{i + 1}
                </span>
                <h3 className="mt-2 font-serif text-xl font-bold text-navy-800">{belief.title}</h3>
                <p className="mt-3 font-semibold text-navy-800">{belief.lead}</p>
                <p className="mt-2 text-navy-500">{belief.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Our Companies */}
      <section id="companies" className="bg-mist py-16 sm:py-[82px]">
        <Container>
          <Eyebrow>Our Companies</Eyebrow>
          <SectionHeading>A family of intelligent businesses.</SectionHeading>

          <ul className="grid gap-6 sm:grid-cols-2">
            {portfolio.map((item) => (
              <li key={item.name} className="rounded-2xl border border-line bg-white p-6 sm:p-7">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-500">
                  {item.sector}
                </p>
                <h3 className="mt-2 font-serif text-2xl font-bold text-navy-800">{item.name}</h3>
                <p className="mt-3 text-navy-500">{item.detail}</p>
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm font-bold text-navy-800 underline underline-offset-4 hover:text-brand-500"
                  >
                    Visit {item.name}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Leadership */}
      <section id="leadership" className="py-16 sm:py-[82px]">
        <Container>
          <Eyebrow>Leadership</Eyebrow>
          <SectionHeading>{leadership.name}</SectionHeading>

          <div className="max-w-[760px]">
            <p className="mb-6 text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-500">
              {leadership.role}
            </p>
            <div className="space-y-5 text-lg text-navy-500">
              {leadership.bio.map((para) => (
                <p key={para.slice(0, 32)}>{para}</p>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Vision — closing statement, inverted so it lands. */}
      <section className="bg-navy-800 py-16 text-white sm:py-24">
        <Container>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-300">Vision</p>
          <p className="mt-3 mb-8 font-serif text-[clamp(2rem,4.5vw,3.25rem)] font-bold leading-tight">
            Building intelligent businesses.
          </p>
          <div className="max-w-[720px] space-y-5 text-lg text-navy-200">
            <p>
              We envision a future where AI is not simply a tool, but an intelligent partner that
              empowers organizations across industries.
            </p>
            <p>
              Our goal is to create a family of companies that combine technology, operational
              excellence, and human creativity to build lasting businesses that improve the way
              people live and work.
            </p>
          </div>
          <Link
            href="/contact"
            className="mt-9 inline-block rounded-full bg-white px-6 py-3.5 font-bold text-navy-800 transition-colors hover:bg-navy-100"
          >
            Start a conversation
          </Link>
          <p className="mt-6 text-sm text-navy-300">
            {company.address.city}, {company.address.state}
          </p>
        </Container>
      </section>
    </main>
  );
}

import { portfolio, type PortfolioCompany } from "@/lib/content";
import { Container, Eyebrow, SectionHeading } from "./section";

function Card({ item }: { item: PortfolioCompany }) {
  const body = (
    <>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-500">
        {item.sector}
      </p>
      <h3 className="mt-2 font-serif text-xl font-bold text-navy-800">{item.name}</h3>
      <p className="mt-2 text-navy-500">{item.summary}</p>
      {item.href ? (
        <span className="mt-4 inline-block text-sm font-bold text-navy-800 group-hover:text-brand-500">
          Visit site →
        </span>
      ) : null}
    </>
  );

  const shell = "group block h-full rounded-2xl border border-line bg-white p-6";

  return item.href ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={`${shell} transition-shadow hover:shadow-lg`}
    >
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function Portfolio() {
  return (
    <section id="portfolio" className="bg-mist py-16 sm:py-[82px]">
      <Container>
        <Eyebrow>Portfolio</Eyebrow>
        <SectionHeading>A growing ecosystem of businesses.</SectionHeading>
        {/* Five across at lg — 4 columns would strand the fifth card alone on a
            second row. Revisit the column count when a sixth company lands. */}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {portfolio.map((item) => (
            <li key={item.name}>
              <Card item={item} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

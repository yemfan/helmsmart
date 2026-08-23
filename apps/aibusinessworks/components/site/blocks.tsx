import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductContent } from "@/content/products";
import { ButtonLink } from "@/components/ui/button";
import { Container, cx, Section, SectionHeading } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";
import { CTA, DISCLAIMERS } from "@/lib/site";

/* -------------------------------------------------------------------------- */
/*  Product card                                                               */
/* -------------------------------------------------------------------------- */

const ACCENT_BAR: Record<ProductContent["accent"], string> = {
  cyan: "bg-cyan-accent",
  gold: "bg-gold-accent",
  navy: "bg-navy-600",
};

const ACCENT_TEXT: Record<ProductContent["accent"], string> = {
  cyan: "text-[#12657c]",
  gold: "text-[#7a6122]",
  navy: "text-navy-600",
};

const ACCENT_CHIP: Record<ProductContent["accent"], string> = {
  cyan: "bg-cyan-soft text-[#12657c]",
  gold: "bg-gold-soft text-[#7a6122]",
  navy: "bg-navy-50 text-navy-700",
};

export function ProductCard({
  product,
  href,
}: {
  product: ProductContent;
  href?: string;
}) {
  const target = href ?? `/solutions#${product.key}`;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-card transition-shadow duration-200 hover:shadow-lift">
      <div className={cx("h-1", ACCENT_BAR[product.accent])} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <span
          className={cx(
            "inline-flex w-fit rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
            ACCENT_CHIP[product.accent],
          )}
        >
          {product.category}
        </span>
        <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink">
          {product.name}
        </h3>
        <p className={cx("mt-1.5 text-sm font-medium", ACCENT_TEXT[product.accent])}>
          {product.tagline}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted">{product.summary}</p>

        <ul className="mt-5 space-y-2.5">
          {product.helps.map((help) => (
            <li key={help} className="flex gap-2.5 text-sm leading-relaxed text-[#33405a]">
              <span
                aria-hidden="true"
                className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", ACCENT_BAR[product.accent])}
              />
              {help}
            </li>
          ))}
        </ul>

        <div className="mt-7 pt-1">
          <ButtonLink href={target} variant="secondary" size="sm">
            {product.cta}
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Numbered steps                                                             */
/* -------------------------------------------------------------------------- */

export interface Step {
  title: string;
  body: string;
}

export function StepList({ steps, tone = "light" }: { steps: Step[]; tone?: "light" | "dark" }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((step, i) => (
        <li
          key={step.title}
          className={cx(
            "relative rounded-2xl border p-5",
            tone === "dark"
              ? "border-white/12 bg-white/[0.04]"
              : "border-hairline bg-white shadow-card",
          )}
        >
          <span
            className={cx(
              "inline-flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold",
              tone === "dark" ? "bg-cyan-accent text-navy-950" : "bg-navy-900 text-white",
            )}
          >
            {i + 1}
          </span>
          <h3
            className={cx(
              "mt-4 font-display text-base font-semibold tracking-tight",
              tone === "dark" ? "text-white" : "text-ink",
            )}
          >
            {step.title}
          </h3>
          <p
            className={cx(
              "mt-2 text-sm leading-relaxed",
              tone === "dark" ? "text-navy-300" : "text-muted",
            )}
          >
            {step.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature list                                                               */
/* -------------------------------------------------------------------------- */

export function FeatureGrid({
  items,
  cols = 3,
  tone = "light",
}: {
  items: { title: string; body: ReactNode }[];
  cols?: 2 | 3 | 4;
  tone?: "light" | "dark";
}) {
  const grid =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cx("grid gap-4", grid)}>
      {items.map((item) => (
        <div
          key={item.title}
          className={cx(
            "rounded-2xl border p-5 sm:p-6",
            tone === "dark"
              ? "border-white/12 bg-white/[0.04]"
              : "border-hairline bg-white shadow-card",
          )}
        >
          <h3
            className={cx(
              "font-display text-base font-semibold tracking-tight",
              tone === "dark" ? "text-white" : "text-ink",
            )}
          >
            {item.title}
          </h3>
          <div
            className={cx(
              "mt-2.5 text-sm leading-relaxed",
              tone === "dark" ? "text-navy-300" : "text-muted",
            )}
          >
            {item.body}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Closing CTA                                                                */
/* -------------------------------------------------------------------------- */

export function ClosingCta({
  headline = "Ready to build your AI business?",
  sub = "Join AI Business Works and help businesses discover the next generation of AI solutions.",
  rates,
}: {
  headline?: string;
  sub?: string;
  rates?: ReactNode;
}) {
  return (
    <Section tone="dark" grid size="roomy">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading
            tone="dark"
            align="center"
            eyebrow="Become a Partner"
            title={headline}
            lead={sub}
          />
        </div>

        {rates ? <div className="mx-auto mt-12 max-w-4xl">{rates}</div> : null}

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/join" variant="onDark" size="lg">
            Become an AI Business Works Partner
          </ButtonLink>
          <ButtonLink href={CTA.compensation.href} variant="ghost" size="lg" className="text-white hover:bg-white/10 hover:text-white">
            {CTA.compensation.label}
          </ButtonLink>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <Disclaimer tone="dark">{DISCLAIMERS.final}</Disclaimer>
        </div>
      </Container>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page header for interior pages                                             */
/* -------------------------------------------------------------------------- */

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Section tone="dark" grid size="tight" className="pt-20 sm:pt-24">
      <Container>
        <SectionHeading tone="dark" eyebrow={eyebrow} title={title} lead={lead} />
        {children ? <div className="mt-10">{children}</div> : null}
      </Container>
    </Section>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-navy-700 underline decoration-navy-200 underline-offset-4 transition-colors hover:text-navy-900 hover:decoration-navy-400"
    >
      {children}
    </Link>
  );
}

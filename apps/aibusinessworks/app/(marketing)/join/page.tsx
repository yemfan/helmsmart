import type { Metadata } from "next";
import Link from "next/link";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatMonthsAsYears } from "@/lib/compensation/format";
import { Container, Section } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";
import { JoinForm } from "@/components/site/join-form";
import { DISCLAIMERS } from "@/lib/site";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Become a Partner",
  description:
    "Register for the AI Business Works Partner Program. Free to join, no inventory and no purchase requirement. Help businesses adopt AI and earn recurring commissions on qualifying customer subscriptions.",
  alternates: { canonical: "/join" },
};

export default async function JoinPage() {
  const { rules } = await loadPublicRules();

  return (
    <Section tone="alt" size="tight" className="pt-14 sm:pt-16">
      <Container width="wide">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:gap-14">
          {/* What you are signing up for */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-navy-500">
              Partner registration
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              Become an AI Business Works Partner
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted">
              Registration takes a couple of minutes. Your account is reviewed before it is
              approved, and your referral link, discount code and the Academy open as soon as it
              is.
            </p>

            <dl className="mt-8 space-y-4 border-t border-hairline pt-6">
              <Item
                term="Direct commission"
                detail={`${rules.direct.yearRatesBps
                  .slice(0, Math.ceil(rules.direct.durationMonths / 12))
                  .map((b) => formatBps(b))
                  .join(" / ")} across ${formatMonthsAsYears(rules.direct.durationMonths)} per qualifying customer`}
              />
              <Item
                term="Leadership Override"
                detail={`${formatBps(rules.leadership.generationRatesBps[0] ?? 0)} on qualifying customer revenue from your Direct Partners, once you qualify`}
              />
              <Item term="Cost to join" detail="Free. No inventory, no purchase requirement, no monthly minimum." />
              <Item
                term="What you need"
                detail="Businesses you already talk to, and the willingness to learn the products properly."
              />
            </dl>

            <div className="mt-8">
              <Disclaimer>{DISCLAIMERS.hero}</Disclaimer>
            </div>

            <p className="mt-6 text-sm text-muted">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-navy-700 underline underline-offset-4">
                Log in
              </Link>
              .
            </p>
          </aside>

          <div>
            <JoinForm />
          </div>
        </div>
      </Container>
    </Section>
  );
}

function Item({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        {term}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-[#33405a]">{detail}</dd>
    </div>
  );
}

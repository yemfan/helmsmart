import type { Metadata } from "next";
import Link from "next/link";
import { STORY_STANDARD, SUCCESS_STORIES } from "@/content/stories";
import { Card, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ClosingCta, PageHero } from "@/components/site/blocks";

export const metadata: Metadata = {
  title: "Success Stories",
  description:
    "Verified customer and Partner stories from the AI Business Works ecosystem, published only with the named subject's approval and their own measured results.",
  alternates: { canonical: "/success-stories" },
};

export default function SuccessStoriesPage() {
  const customerStories = SUCCESS_STORIES.filter((s) => s.kind === "customer");
  const partnerStories = SUCCESS_STORIES.filter((s) => s.kind === "partner");

  return (
    <>
      <PageHero
        eyebrow="Success stories"
        title="Real customers. Real work. Published with permission."
        lead="This page holds verified stories from named customers and Partners. Nothing appears here until the subject has read it and approved it."
      />

      {SUCCESS_STORIES.length === 0 ? (
        <Section tone="light">
          <Container width="narrow">
            <div className="rounded-2xl border border-dashed border-hairline bg-canvas-alt p-8 text-center sm:p-12">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
                No stories published yet
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
                The AI Business Works Partner Program is new. Rather than fill this page with
                invented testimonials or stock quotes, it stays empty until there are real,
                named customers and Partners willing to put their results on the record.
              </p>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
                If you are already working with an AI Business Works product and would be willing
                to share what changed,{" "}
                <Link
                  href="/join"
                  className="font-medium text-navy-700 underline underline-offset-4"
                >
                  get in touch
                </Link>
                .
              </p>
            </div>
          </Container>
        </Section>
      ) : (
        <>
          {customerStories.length ? (
            <Section tone="light">
              <Container width="wide">
                <SectionHeading eyebrow="Customers" title="What businesses changed" />
                <div className="mt-10 grid gap-5 lg:grid-cols-2">
                  {customerStories.map((story) => (
                    <StoryCard key={story.slug} story={story} />
                  ))}
                </div>
              </Container>
            </Section>
          ) : null}

          {partnerStories.length ? (
            <Section tone="alt">
              <Container width="wide">
                <SectionHeading eyebrow="Partners" title="What Partners built" />
                <div className="mt-10 grid gap-5 lg:grid-cols-2">
                  {partnerStories.map((story) => (
                    <StoryCard key={story.slug} story={story} />
                  ))}
                </div>
                <div className="mt-10">
                  <Disclaimer>
                    Partner stories describe the business a Partner built. They are individual
                    experiences, are not typical or expected results, and do not describe or
                    predict earnings.
                  </Disclaimer>
                </div>
              </Container>
            </Section>
          ) : null}
        </>
      )}

      <Section tone={SUCCESS_STORIES.length ? "light" : "alt"}>
        <Container>
          <SectionHeading
            eyebrow="Editorial standard"
            title="What has to be true before a story is published"
            lead="These rules are why this page is short. They are not going to be relaxed to fill it."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STORY_STANDARD.map((rule) => (
              <Card key={rule.title}>
                <h3 className="font-display text-base font-semibold text-ink">{rule.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{rule.detail}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <ClosingCta />
    </>
  );
}

function StoryCard({ story }: { story: (typeof SUCCESS_STORIES)[number] }) {
  return (
    <Card className="flex h-full flex-col">
      <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{story.title}</h3>
      <p className="mt-2 text-sm font-medium text-navy-600">
        {story.subject} &middot; {story.role} &middot; {story.location}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-muted">{story.summary}</p>

      <h4 className="mt-6 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        Outcomes
      </h4>
      <ul className="mt-3 space-y-2">
        {story.outcomes.map((outcome) => (
          <li key={outcome} className="flex gap-2.5 text-sm leading-relaxed text-[#33405a]">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-accent" />
            {outcome}
          </li>
        ))}
      </ul>

      {story.quote ? (
        <blockquote className="mt-6 border-l-2 border-navy-200 pl-4 text-sm italic leading-relaxed text-[#33405a]">
          {story.quote.text}
          <footer className="mt-2 text-xs not-italic text-muted">
            {story.quote.attribution}
          </footer>
        </blockquote>
      ) : null}

      <p className="mt-6 text-xs text-muted">Approved for publication {story.approvedOn}.</p>
    </Card>
  );
}

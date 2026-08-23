import type { Metadata } from "next";
import { ACADEMY_COURSES, ACADEMY_TRACKS } from "@/content/academy";
import { Badge, Card, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { ClosingCta, InlineLink, PageHero } from "@/components/site/blocks";
import { loadPublicRules } from "@/lib/compensation/repository";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Partner Academy",
  description:
    "The AI Business Works Partner Academy: AI fundamentals, AI Workforce, product training for CloseBoss AI, MarketingBoss AI and HelmSmart AI, sales skills, customer success, leadership and compliance.",
  alternates: { canonical: "/academy" },
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default async function AcademyPage() {
  const { rules } = await loadPublicRules();
  const totalMinutes = ACADEMY_COURSES.reduce((sum, c) => sum + c.durationMinutes, 0);
  const totalLessons = ACADEMY_COURSES.reduce((sum, c) => sum + c.lessonCount, 0);

  return (
    <>
      <PageHero
        eyebrow="Academy"
        title="AI Business Works Academy"
        lead="Twelve courses, from what AI actually does in a business through to the compliance rules every Partner is held to. You do not need a technical background - you need to understand the products and recognise the businesses they fit."
      >
        <div className="flex flex-wrap gap-6 text-sm text-navy-200">
          <span>
            <strong className="font-semibold text-white">{ACADEMY_COURSES.length}</strong> courses
          </span>
          <span>
            <strong className="font-semibold text-white">{totalLessons}</strong> lessons
          </span>
          <span>
            <strong className="font-semibold text-white">{formatDuration(totalMinutes)}</strong>{" "}
            of training
          </span>
        </div>
      </PageHero>

      <Section tone="light">
        <Container width="wide">
          <SectionHeading
            eyebrow="Curriculum"
            title="Five tracks"
            lead="Work through them in order, or go straight to the product you are about to show."
          />

          <div className="mt-12 space-y-12">
            {ACADEMY_TRACKS.map((track) => {
              const courses = ACADEMY_COURSES.filter((c) => c.track === track.key);
              if (!courses.length) return null;
              return (
                <div key={track.key}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                      {track.name}
                    </h3>
                    <p className="text-sm text-muted">{track.detail}</p>
                  </div>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map((course) => (
                      <li key={course.key}>
                        <Card className="h-full">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="font-display text-base font-semibold tracking-tight text-ink">
                              {course.title}
                            </h4>
                            {course.isRequiredForLeadership ? (
                              <Badge tone="gold">Leadership</Badge>
                            ) : null}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-muted">
                            {course.summary}
                          </p>
                          <p className="mt-5 text-xs font-medium text-navy-500">
                            {course.lessonCount} lessons &middot;{" "}
                            {formatDuration(course.durationMinutes)}
                          </p>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section tone="alt">
        <Container>
          <SectionHeading
            eyebrow="Progress and certification"
            title="What the Academy tracks"
            lead="Course progress is recorded per Partner, and completion feeds directly into qualification."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {[
              { title: "Lessons", body: "Each course is a set of lessons you complete at your own pace." },
              { title: "Progress", body: "Your position in every course is saved and visible in your dashboard." },
              { title: "Certificates", body: "Completing a course issues a certificate with a verifiable code." },
              {
                title: "Qualification",
                body: rules.leaderQualification.requireAcademyTraining
                  ? "The Partner Leadership and Compliance courses are required before Leader qualification."
                  : "Academy completion is recommended but not currently required for Leader qualification.",
              },
            ].map((item) => (
              <Card key={item.title}>
                <h3 className="font-display text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-8 text-sm leading-relaxed text-muted">
            Academy courses open once your Partner account is approved.{" "}
            <InlineLink href="/join">Register as a Partner</InlineLink> or{" "}
            <InlineLink href="/login">log in</InlineLink> to continue where you left off.
          </p>
        </Container>
      </Section>

      <ClosingCta
        headline="Learn AI. Share AI. Create value."
        sub="The Academy is where the work starts. Register and open it."
      />
    </>
  );
}

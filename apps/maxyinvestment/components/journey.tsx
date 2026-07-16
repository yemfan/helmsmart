import { milestones } from "@/lib/content";
import { Container, Eyebrow, SectionHeading } from "./section";
import { Timeline } from "./timeline";

export function Journey() {
  return (
    <section id="journey" className="py-16 sm:py-[82px]">
      <Container>
        <Eyebrow>Our Journey</Eyebrow>
        <SectionHeading>From real estate and hospitality to intelligent businesses.</SectionHeading>
        <Timeline items={milestones} />
      </Container>
    </section>
  );
}

/**
 * Success stories.
 *
 * Deliberately empty. A partner program's credibility rests on the stories
 * being real, so nothing ships here until there is a verified customer or
 * Partner behind it. The page renders the publication standard and an honest
 * empty state instead of invented testimonials; administrators publish real
 * stories through the admin dashboard once they clear the checklist below.
 */

export interface SuccessStory {
  slug: string;
  kind: "customer" | "partner";
  title: string;
  summary: string;
  /** Named subject. Anonymous stories are not published. */
  subject: string;
  role: string;
  location: string;
  productKeys: string[];
  /** The situation before, in the subject's own framing. */
  before: string[];
  /** What they actually did. */
  what: string[];
  /** Outcomes. Only measurable, subject-verified statements. */
  outcomes: string[];
  quote?: { text: string; attribution: string };
  /** Date the subject signed off on publication. */
  approvedOn: string;
}

export const SUCCESS_STORIES: SuccessStory[] = [];

export const STORY_STANDARD = [
  {
    title: "Named and consented",
    detail:
      "The customer or Partner is named, has read the finished story, and has approved publication in writing.",
  },
  {
    title: "Specific about the work",
    detail:
      "The story says what the business changed and what it took. A result with no method behind it is not a story.",
  },
  {
    title: "Measured, not estimated",
    detail:
      "Outcomes come from the customer's own numbers over a stated period. No projections, no annualised extrapolations.",
  },
  {
    title: "No income claims",
    detail:
      "Partner stories describe the business built, not the money earned. Nothing here is presented as typical or expected.",
  },
];

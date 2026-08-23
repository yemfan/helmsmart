export interface AcademyCourse {
  key: string;
  title: string;
  summary: string;
  track: "foundation" | "product" | "sales" | "growth" | "leadership";
  productKey: string | null;
  durationMinutes: number;
  lessonCount: number;
  isRequiredForLeadership: boolean;
}

export const ACADEMY_TRACKS: { key: AcademyCourse["track"]; name: string; detail: string }[] = [
  {
    key: "foundation",
    name: "Foundation",
    detail: "What AI does well, what it does badly, and how to talk about it without overselling.",
  },
  {
    key: "product",
    name: "Products",
    detail: "One course per product: what it does, who it fits, and how to show it.",
  },
  {
    key: "sales",
    name: "Sales",
    detail: "Finding the pain, running the demo, and handling the conversation honestly.",
  },
  {
    key: "growth",
    name: "Growth",
    detail: "Visibility, onboarding and retention - the work that makes commissions recur.",
  },
  {
    key: "leadership",
    name: "Leadership",
    detail: "Developing Partners, and the compliance responsibilities that come with it.",
  },
];

/** Mirrors the `abw_academy_courses` seed. The database is authoritative. */
export const ACADEMY_COURSES: AcademyCourse[] = [
  {
    key: "ai-business-fundamentals",
    title: "AI Business Fundamentals",
    summary:
      "What AI actually does well in a business today, where it fails, and how to talk about it without overselling.",
    track: "foundation",
    productKey: null,
    durationMinutes: 90,
    lessonCount: 6,
    isRequiredForLeadership: false,
  },
  {
    key: "ai-workforce",
    title: "AI Workforce",
    summary:
      "How AI employees are structured, what they can own end to end, and where a human stays in the loop.",
    track: "foundation",
    productKey: null,
    durationMinutes: 75,
    lessonCount: 5,
    isRequiredForLeadership: false,
  },
  {
    key: "closeboss-ai",
    title: "CloseBoss AI",
    summary:
      "The AI sales team for real estate: lead capture, instant follow-up, qualification and the handoff to the agent.",
    track: "product",
    productKey: "closeboss",
    durationMinutes: 120,
    lessonCount: 8,
    isRequiredForLeadership: false,
  },
  {
    key: "marketingboss-ai",
    title: "MarketingBoss AI",
    summary: "Planning, producing and distributing marketing with an AI marketing team.",
    track: "product",
    productKey: "marketingboss",
    durationMinutes: 120,
    lessonCount: 8,
    isRequiredForLeadership: false,
  },
  {
    key: "helmsmart-ai",
    title: "HelmSmart AI",
    summary: "Running communication, workflows and business knowledge on one AI operating platform.",
    track: "product",
    productKey: "helmsmart",
    durationMinutes: 120,
    lessonCount: 8,
    isRequiredForLeadership: false,
  },
  {
    key: "customer-discovery",
    title: "Customer Discovery",
    summary: "Finding the real operational pain before you recommend anything.",
    track: "sales",
    productKey: null,
    durationMinutes: 60,
    lessonCount: 5,
    isRequiredForLeadership: false,
  },
  {
    key: "product-demonstration",
    title: "Product Demonstration",
    summary: "Running a demo that shows the customer their own workflow, not a feature tour.",
    track: "sales",
    productKey: null,
    durationMinutes: 75,
    lessonCount: 6,
    isRequiredForLeadership: false,
  },
  {
    key: "sales-skills",
    title: "Sales Skills",
    summary:
      "Structuring a conversation, handling objections honestly, and knowing when the answer is no.",
    track: "sales",
    productKey: null,
    durationMinutes: 90,
    lessonCount: 7,
    isRequiredForLeadership: false,
  },
  {
    key: "content-marketing",
    title: "Content Marketing",
    summary: "Building professional visibility so businesses come to you.",
    track: "growth",
    productKey: null,
    durationMinutes: 60,
    lessonCount: 5,
    isRequiredForLeadership: false,
  },
  {
    key: "customer-success",
    title: "Customer Success",
    summary: "Onboarding, adoption and retention - the work that makes recurring commissions recur.",
    track: "growth",
    productKey: null,
    durationMinutes: 75,
    lessonCount: 6,
    isRequiredForLeadership: false,
  },
  {
    key: "partner-leadership",
    title: "Partner Leadership",
    summary:
      "Developing Direct Partners, and the responsibilities that come with the Leadership Override.",
    track: "leadership",
    productKey: null,
    durationMinutes: 120,
    lessonCount: 8,
    isRequiredForLeadership: true,
  },
  {
    key: "compliance",
    title: "Compliance",
    summary: "What you may and may not say about the products, the program and potential earnings.",
    track: "leadership",
    productKey: null,
    durationMinutes: 60,
    lessonCount: 5,
    isRequiredForLeadership: true,
  },
];

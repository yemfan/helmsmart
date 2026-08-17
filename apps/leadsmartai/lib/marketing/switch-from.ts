/**
 * "Switch from [CRM]" landing pages — registry.
 *
 * Each entry powers a page at /switch-from/<slug> with:
 *   - Why-leave pain points
 *   - Migration steps (export from source → import to CloseBoss)
 *   - Feature comparison highlights (a subset of /agent/compare)
 *   - Concierge migration CTA (white-glove migration offer)
 *
 * Adding a new CRM: append a SwitchSource entry, drop a JSON-LD
 * description, and the dynamic route + sitemap + index page pick it
 * up automatically.
 */

export type SwitchSource = {
  slug: string;
  /** Display name of the source CRM — a product name, not copy. */
  name: string;
  /** Marketing pitch as the source CRM advertises itself, in their words. */
  positioning: string;
  /** Visible monthly price range (USD) — kept current with /agent/compare. */
  priceRange: string;
  /** Headline shown on the page (overridden by render if missing). */
  heroHeadline: string;
  /** Sub-head under the hero. */
  heroSubhead: string;
  /**
   * Time-sensitive callout shown above the hero. Only set when there's
   * a real reason to act now (e.g. LionDesk shutdown). Leave undefined
   * for evergreen pages.
   */
  urgencyBanner?: string;
  /**
   * Optional companion content. If we already published a blog post
   * about this CRM (e.g. the LionDesk shutdown piece), link it.
   */
  companionPost?: { href: string; label: string };
  /** Why agents are leaving. 3–4 pain points specific to this CRM. */
  painPoints: Array<{ title: string; body: string }>;
  /** Features where CloseBoss wins (drives the comparison block). */
  comparisonWins: Array<{ feature: string; them: string; us: string }>;
  /** Step-by-step migration. Generic enough to cover most data shapes. */
  migrationSteps: string[];
  /** FAQ shown at the bottom. */
  faq: Array<{ q: string; a: string }>;
};

const COMMON_MIGRATION_STEPS = [
  "pages.switchFrom.step1",
  "pages.switchFrom.step2",
  "pages.switchFrom.step3",
  "pages.switchFrom.step4",
  "pages.switchFrom.step5",
  "pages.switchFrom.step6",
];

const COMMON_FAQ: Array<{ q: string; a: string }> = [
  { q: "pages.switchFrom.cq1", a: "pages.switchFrom.ca1" },
  { q: "pages.switchFrom.cq2", a: "pages.switchFrom.ca2" },
  { q: "pages.switchFrom.cq3", a: "pages.switchFrom.ca3" },
  { q: "pages.switchFrom.cq4", a: "pages.switchFrom.ca4" },
];

/*
 * Every copy field below holds a TRANSLATION KEY, not copy. A module-scope
 * constant cannot hold a hook, so the previous version rendered English on all
 * six pages no matter what the reader had chosen. Names, slugs and prices stay
 * literal: a product's name is its name, and a price is a number.
 */
export const SWITCH_SOURCES: ReadonlyArray<SwitchSource> = [
  {
    slug: "liondesk",
    name: "LionDesk",
    positioning: "pages.switchFrom.liondeskPositioning",
    priceRange: "$25–$83 / mo",
    heroHeadline: "pages.switchFrom.liondeskHeadline",
    heroSubhead: "pages.switchFrom.liondeskSubhead",
    urgencyBanner: "pages.switchFrom.liondeskUrgency",
    companionPost: { href: "/blog/liondesk-shutdown-what-agents-should-do-next", label: "pages.switchFrom.liondeskCompanion" },
    painPoints: [
      { title: "pages.switchFrom.liondeskP1T", body: "pages.switchFrom.liondeskP1B" },
      { title: "pages.switchFrom.liondeskP2T", body: "pages.switchFrom.liondeskP2B" },
      { title: "pages.switchFrom.liondeskP3T", body: "pages.switchFrom.liondeskP3B" },
      { title: "pages.switchFrom.liondeskP4T", body: "pages.switchFrom.liondeskP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.liondeskW1F", them: "pages.switchFrom.liondeskW1T", us: "pages.switchFrom.liondeskW1U" },
      { feature: "pages.switchFrom.liondeskW2F", them: "pages.switchFrom.liondeskW2T", us: "pages.switchFrom.liondeskW2U" },
      { feature: "pages.switchFrom.liondeskW3F", them: "pages.switchFrom.liondeskW3T", us: "pages.switchFrom.liondeskW3U" },
      { feature: "pages.switchFrom.liondeskW4F", them: "pages.switchFrom.liondeskW4T", us: "pages.switchFrom.liondeskW4U" },
      { feature: "pages.switchFrom.liondeskW5F", them: "pages.switchFrom.liondeskW5T", us: "pages.switchFrom.liondeskW5U" },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: [{ q: "pages.switchFrom.liondeskQ0", a: "pages.switchFrom.liondeskA0" }, ...COMMON_FAQ],
  },
  {
    slug: "follow-up-boss",
    name: "Follow Up Boss",
    positioning: "pages.switchFrom.fubPositioning",
    priceRange: "$69–$1,000+ / mo",
    heroHeadline: "pages.switchFrom.fubHeadline",
    heroSubhead: "pages.switchFrom.fubSubhead",
    painPoints: [
      { title: "pages.switchFrom.fubP1T", body: "pages.switchFrom.fubP1B" },
      { title: "pages.switchFrom.fubP2T", body: "pages.switchFrom.fubP2B" },
      { title: "pages.switchFrom.fubP3T", body: "pages.switchFrom.fubP3B" },
      { title: "pages.switchFrom.fubP4T", body: "pages.switchFrom.fubP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.fubW1F", them: "pages.switchFrom.fubW1T", us: "pages.switchFrom.fubW1U" },
      { feature: "pages.switchFrom.fubW2F", them: "pages.switchFrom.fubW2T", us: "pages.switchFrom.fubW2U" },
      { feature: "pages.switchFrom.fubW3F", them: "pages.switchFrom.fubW3T", us: "pages.switchFrom.fubW3U" },
      { feature: "pages.switchFrom.fubW4F", them: "pages.switchFrom.fubW4T", us: "pages.switchFrom.fubW4U" },
      { feature: "pages.switchFrom.fubW5F", them: "pages.switchFrom.fubW5T", us: "pages.switchFrom.fubW5U" },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "lofty",
    name: "Lofty",
    positioning: "pages.switchFrom.loftyPositioning",
    priceRange: "$499+ / mo",
    heroHeadline: "pages.switchFrom.loftyHeadline",
    heroSubhead: "pages.switchFrom.loftySubhead",
    painPoints: [
      { title: "pages.switchFrom.loftyP1T", body: "pages.switchFrom.loftyP1B" },
      { title: "pages.switchFrom.loftyP2T", body: "pages.switchFrom.loftyP2B" },
      { title: "pages.switchFrom.loftyP3T", body: "pages.switchFrom.loftyP3B" },
      { title: "pages.switchFrom.loftyP4T", body: "pages.switchFrom.loftyP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.loftyW1F", them: "pages.switchFrom.loftyW1T", us: "pages.switchFrom.loftyW1U" },
      { feature: "pages.switchFrom.loftyW2F", them: "pages.switchFrom.loftyW2T", us: "pages.switchFrom.loftyW2U" },
      { feature: "pages.switchFrom.loftyW3F", them: "pages.switchFrom.loftyW3T", us: "pages.switchFrom.loftyW3U" },
      { feature: "pages.switchFrom.loftyW4F", them: "pages.switchFrom.loftyW4T", us: "pages.switchFrom.loftyW4U" },
      { feature: "pages.switchFrom.loftyW5F", them: "pages.switchFrom.loftyW5T", us: "pages.switchFrom.loftyW5U" },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "boomtown",
    name: "BoomTown",
    positioning: "pages.switchFrom.boomPositioning",
    priceRange: "$1,500+ / mo",
    heroHeadline: "pages.switchFrom.boomHeadline",
    heroSubhead: "pages.switchFrom.boomSubhead",
    painPoints: [
      { title: "pages.switchFrom.boomP1T", body: "pages.switchFrom.boomP1B" },
      { title: "pages.switchFrom.boomP2T", body: "pages.switchFrom.boomP2B" },
      { title: "pages.switchFrom.boomP3T", body: "pages.switchFrom.boomP3B" },
      { title: "pages.switchFrom.boomP4T", body: "pages.switchFrom.boomP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.boomW1F", them: "pages.switchFrom.boomW1T", us: "pages.switchFrom.boomW1U" },
      { feature: "pages.switchFrom.boomW2F", them: "pages.switchFrom.boomW2T", us: "pages.switchFrom.boomW2U" },
      { feature: "pages.switchFrom.boomW3F", them: "pages.switchFrom.boomW3T", us: "pages.switchFrom.boomW3U" },
      { feature: "pages.switchFrom.boomW4F", them: "pages.switchFrom.boomW4T", us: "pages.switchFrom.boomW4U" },
      { feature: "pages.switchFrom.boomW5F", them: "pages.switchFrom.boomW5T", us: "pages.switchFrom.boomW5U" },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "sierra-interactive",
    name: "Sierra Interactive",
    positioning: "pages.switchFrom.sierraPositioning",
    priceRange: "$500+ / mo",
    heroHeadline: "pages.switchFrom.sierraHeadline",
    heroSubhead: "pages.switchFrom.sierraSubhead",
    painPoints: [
      { title: "pages.switchFrom.sierraP1T", body: "pages.switchFrom.sierraP1B" },
      { title: "pages.switchFrom.sierraP2T", body: "pages.switchFrom.sierraP2B" },
      { title: "pages.switchFrom.sierraP3T", body: "pages.switchFrom.sierraP3B" },
      { title: "pages.switchFrom.sierraP4T", body: "pages.switchFrom.sierraP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.sierraW1F", them: "pages.switchFrom.sierraW1T", us: "pages.switchFrom.sierraW1U" },
      { feature: "pages.switchFrom.sierraW2F", them: "pages.switchFrom.sierraW2T", us: "pages.switchFrom.sierraW2U" },
      { feature: "pages.switchFrom.sierraW3F", them: "pages.switchFrom.sierraW3T", us: "pages.switchFrom.sierraW3U" },
      { feature: "pages.switchFrom.sierraW4F", them: "pages.switchFrom.sierraW4T", us: "pages.switchFrom.sierraW4U" },
      { feature: "pages.switchFrom.sierraW5F", them: "pages.switchFrom.sierraW5T", us: "pages.switchFrom.sierraW5U" },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "kvcore",
    name: "kvCORE",
    positioning: "pages.switchFrom.kvPositioning",
    priceRange: "$499+ / mo",
    heroHeadline: "pages.switchFrom.kvHeadline",
    heroSubhead: "pages.switchFrom.kvSubhead",
    painPoints: [
      { title: "pages.switchFrom.kvP1T", body: "pages.switchFrom.kvP1B" },
      { title: "pages.switchFrom.kvP2T", body: "pages.switchFrom.kvP2B" },
      { title: "pages.switchFrom.kvP3T", body: "pages.switchFrom.kvP3B" },
      { title: "pages.switchFrom.kvP4T", body: "pages.switchFrom.kvP4B" },
    ],
    comparisonWins: [
      { feature: "pages.switchFrom.kvW1F", them: "pages.switchFrom.kvW1T", us: "pages.switchFrom.kvW1U" },
      { feature: "pages.switchFrom.kvW2F", them: "pages.switchFrom.kvW2T", us: "pages.switchFrom.kvW2U" },
      { feature: "pages.switchFrom.kvW3F", them: "pages.switchFrom.kvW3T", us: "pages.switchFrom.kvW3U" },
      { feature: "pages.switchFrom.kvW4F", them: "pages.switchFrom.kvW4T", us: "pages.switchFrom.kvW4U" },
      { feature: "pages.switchFrom.kvW5F", them: "pages.switchFrom.kvW5T", us: "pages.switchFrom.kvW5U" },
    ],
    migrationSteps: [
      "pages.switchFrom.kvS1",
      "pages.switchFrom.kvS2",
      "pages.switchFrom.kvS3",
      "pages.switchFrom.kvS4",
      "pages.switchFrom.kvS5",
      "pages.switchFrom.kvS6",
      "pages.switchFrom.kvS7",
    ],
    faq: [{ q: "pages.switchFrom.kvQ0", a: "pages.switchFrom.kvA0" }, ...COMMON_FAQ],
  },
];

export function getSwitchSource(slug: string): SwitchSource | null {
  return SWITCH_SOURCES.find((s) => s.slug === slug) ?? null;
}

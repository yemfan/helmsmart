/**
 * AVASC "Could this be a scam?" decision-tree ad content.
 *
 * Each entry drives one branded decision-tree image ad (see renderAd.tsx). The
 * format is deliberately the same shape every time — a top question, two red-flag
 * branch questions, and a single "when in doubt → avasc.org" CTA — so the series
 * reads as a recognisable AVASC campaign. Copy is public-safe: it teaches the
 * red flags, never a how-to, and never shames the victim.
 *
 * Adding a scam type = one entry here; the renderer + autopilot pick it up.
 */

export type ScamTree = {
  key: string;
  /** Small gold eyebrow above the headline. */
  eyebrow: string;
  /** Headline line 1 (white). */
  headline: string;
  /** Headline line 2 (gold accent) — the hook. */
  headlineAccent: string;
  /** Top decision node question. */
  nodeTop: string;
  /** Two red-flag branch questions. */
  nodeLeft: string;
  nodeRight: string;
  /** Gold CTA pill. */
  cta: string;
  /** One-line caption seed for the social post (the renderer draws the image; this is the text body). */
  caption: string;
};

export const SCAM_TREES: ScamTree[] = [
  {
    key: "smishing",
    eyebrow: "SPOT THE SCAM",
    headline: "Could this text",
    headlineAccent: "BE A SCAM?",
    nodeTop: "Did they message you first?",
    nodeLeft: "Rushing or threatening you",
    nodeRight: "A link to “confirm” details",
    cta: "When in doubt → avasc.org",
    caption:
      "Unexpected text with an urgent link? Slow down. Real companies don't threaten you into clicking. When something feels off, check it first — free, no login, at avasc.org.",
  },
  {
    key: "investment",
    eyebrow: "SPOT THE SCAM",
    headline: "Is this “investment”",
    headlineAccent: "TOO GOOD TO BE TRUE?",
    nodeTop: "Guaranteed big returns?",
    nodeLeft: "A stranger who DM’d you",
    nodeRight: "Pay in crypto or gift cards",
    cta: "Check it free → avasc.org",
    caption:
      "“Guaranteed” returns from someone you met online? That's the pig-butchering playbook. No real investment is risk-free, and no honest one is paid in gift cards. Verify before you send a cent — avasc.org.",
  },
  {
    key: "romance",
    eyebrow: "SPOT THE SCAM",
    headline: "Is this online romance",
    headlineAccent: "REALLY REAL?",
    nodeTop: "Never met in person?",
    nodeLeft: "Always an excuse for video",
    nodeRight: "Now they need money",
    cta: "You're not alone → avasc.org",
    caption:
      "Fallen for someone you've never actually met, and now there's an emergency only money can fix? It's one of the most common scams — and it's not your fault. Talk to someone first at avasc.org.",
  },
  {
    key: "techsupport",
    eyebrow: "SPOT THE SCAM",
    headline: "Is this “tech support”",
    headlineAccent: "ACTUALLY A SCAM?",
    nodeTop: "A pop-up or call warned you?",
    nodeLeft: "Wants remote access",
    nodeRight: "Asks you to pay to “fix” it",
    cta: "Don't call back → avasc.org",
    caption:
      "A scary pop-up or a call saying your device is infected? Microsoft and Apple never do that. Don't give anyone remote access or payment. Here's how to check safely — avasc.org.",
  },
  {
    key: "jobscam",
    eyebrow: "SPOT THE SCAM",
    headline: "Is this job offer",
    headlineAccent: "A SETUP?",
    nodeTop: "Hired with no interview?",
    nodeLeft: "Pay upfront for “equipment”",
    nodeRight: "Overpaid — “send the rest back”",
    cta: "Check it free → avasc.org",
    caption:
      "A job that pays great, needs no interview, but asks you to buy equipment or move money? Real employers never make you pay to work. Spot the red flags first — avasc.org.",
  },
];

export function pickScamTree(index: number): ScamTree {
  return SCAM_TREES[((index % SCAM_TREES.length) + SCAM_TREES.length) % SCAM_TREES.length];
}

export function getScamTree(key: string): ScamTree | undefined {
  return SCAM_TREES.find((t) => t.key === key);
}

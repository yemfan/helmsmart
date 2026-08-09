/**
 * Playbook templates — strategies as CONFIG, not code. A template seeds the
 * existing campaign creator: objective, sensible defaults, and milestone
 * definitions whose progress is computed live from the playbook's posts.
 * Shared by the server route (authoritative lookup) and the client picker.
 */

export type MilestoneMetric = "published" | "engagement";

export type MilestoneDef = {
  id: string;
  title: string;
  metric: MilestoneMetric;
  target: number;
};

export type PlaybookTemplate = {
  key: string;
  emoji: string;
  name: string;
  description: string;
  objective: string;
  defaults: { mediaTypes: string[]; frequency: number; mode: "review" | "auto" };
  milestones: MilestoneDef[];
};

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    key: "launch-product",
    emoji: "🚀",
    name: "Launch a product",
    description: "Build anticipation, launch loud, then keep the drumbeat going.",
    objective: "Launch our new product and make the market notice",
    defaults: { mediaTypes: ["image", "video"], frequency: 5, mode: "review" },
    milestones: [
      { id: "warmup", title: "10 launch posts published", metric: "published", target: 10 },
      { id: "drumbeat", title: "25 posts published", metric: "published", target: 25 },
      { id: "traction", title: "500 total engagement", metric: "engagement", target: 500 },
    ],
  },
  {
    key: "first-100-customers",
    emoji: "💯",
    name: "First 100 customers",
    description: "Relentless, proof-driven posting that turns attention into buyers.",
    objective: "Win our first 100 customers",
    defaults: { mediaTypes: ["text", "image"], frequency: 4, mode: "review" },
    milestones: [
      { id: "consistency", title: "20 posts published", metric: "published", target: 20 },
      { id: "signal", title: "250 total engagement", metric: "engagement", target: 250 },
      { id: "scale", title: "1,000 total engagement", metric: "engagement", target: 1000 },
    ],
  },
  {
    key: "grow-local",
    emoji: "📍",
    name: "Grow a local business",
    description: "Own your area: local stories, faces, and reasons to walk in.",
    objective: "Become the best-known name for what we do in our area",
    defaults: { mediaTypes: ["image"], frequency: 3, mode: "review" },
    milestones: [
      { id: "presence", title: "12 posts published", metric: "published", target: 12 },
      { id: "recognition", title: "150 total engagement", metric: "engagement", target: 150 },
      { id: "habit", title: "36 posts published", metric: "published", target: 36 },
    ],
  },
  {
    key: "personal-brand",
    emoji: "🎙️",
    name: "Build a personal brand",
    description: "Show up with a point of view until your name means something.",
    objective: "Build a personal brand people follow and trust",
    defaults: { mediaTypes: ["text", "video"], frequency: 4, mode: "review" },
    milestones: [
      { id: "voice", title: "15 posts published", metric: "published", target: 15 },
      { id: "audience", title: "300 total engagement", metric: "engagement", target: 300 },
      { id: "authority", title: "40 posts published", metric: "published", target: 40 },
    ],
  },
];

export function getTemplate(key: string | null | undefined): PlaybookTemplate | null {
  if (!key) return null;
  return PLAYBOOK_TEMPLATES.find((t) => t.key === key) ?? null;
}

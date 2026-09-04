import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";

import {
  CONTENT_CATEGORIES,
  CONTROLLABLE_PLATFORMS,
  type ContentCategory,
  type ControllablePlatform,
  type SocialAutopilotConfig,
} from "./autopilotConfig";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";

/**
 * Full AI automation: the AI decides the posting plan for the period.
 *
 * When the owner turns this on, they're delegating the *mechanics* — how often
 * to post, which of their connected platforms to use, which topics to cover,
 * and when to publish. It deliberately does NOT decide the approval `mode`:
 * whether a human signs off before something goes out on the owner's name is a
 * trust decision, not an optimisation, so that stays exactly where they set it.
 *
 * Fails soft by design. Any error, malformed answer, or missing key leaves the
 * corresponding setting untouched — a planner outage must degrade to "post on
 * the configured plan", never to "post nothing" or "post wildly".
 */

const MODEL = "claude-sonnet-4-6";

export type AutopilotPlanInput = {
  config: SocialAutopilotConfig;
  /** Platforms the agent actually has connected — the AI can't invent one. */
  connectedPlatforms: string[];
  /** Monday of the period being planned (YYYY-MM-DD). */
  weekOf: string;
  /** The language the AGENT reads — only `reasoning` is prose they see. */
  locale?: string | null;
};

type RawPlan = {
  posts_per_week?: unknown;
  platforms?: unknown;
  content_categories?: unknown;
  posts_per_day?: unknown;
  post_days?: unknown;
  post_hour_utc?: unknown;
  reasoning?: unknown;
};

function buildPrompt(input: AutopilotPlanInput): string {
  const { connectedPlatforms, weekOf } = input;
  return [
    `Plan the social posting schedule for the week starting ${weekOf} for a residential real-estate agent.`,
    "",
    `Connected platforms (you may ONLY choose from these): ${connectedPlatforms.join(", ") || "(none)"}`,
    `Available content categories: ${CONTENT_CATEGORIES.join(", ")}`,
    "",
    "Choose a plan that a real agent would be happy to have run unattended:",
    "- Enough presence to stay visible, not so much it reads as spam.",
    "- Post on days and at a time when clients actually look at their feeds.",
    "- A topic mix that builds trust (useful//educational) rather than only self-promotion.",
    "- 'brand' content is about the agent's own business — use it sparingly.",
    "",
    "Return ONLY a JSON object, no commentary, no markdown fences:",
    "{",
    '  "posts_per_week": 1-7,',
    '  "platforms": ["subset of the connected platforms"],',
    '  "content_categories": ["subset of the available categories"],',
    '  "posts_per_day": 1-5,',
    '  "post_days": [0-6 weekday numbers, 0=Sunday],',
    '  "post_hour_utc": 0-23,',
    '  "reasoning": "one short sentence"',
    "}",
    "",
    "post_days must have at least as many days as needed to fit posts_per_week at posts_per_day per day.",
    languageDirectiveForJson(input.locale),
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(body.slice(first, last + 1));
  } catch {
    return null;
  }
}

function pickInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function pickFrom<T extends string>(
  v: unknown,
  allowed: readonly T[],
  restrictTo?: readonly string[],
): T[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v)].filter(
    (x): x is T =>
      typeof x === "string" &&
      (allowed as readonly string[]).includes(x) &&
      (!restrictTo || restrictTo.includes(x)),
  );
  return out.length > 0 ? out : null;
}

export async function planAutopilotPeriod(
  input: AutopilotPlanInput,
): Promise<SocialAutopilotConfig> {
  const { config, connectedPlatforms } = input;
  // Nothing connected: there is no plan to make, and asking the model to pick
  // from an empty list only invites a hallucinated platform.
  if (connectedPlatforms.length === 0) return config;

  let raw: RawPlan | null = null;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (block && block.type === "text") {
      raw = extractJsonObject(block.text) as RawPlan | null;
    }
  } catch (e) {
    console.warn(
      "[social] AI autopilot planning failed, keeping configured plan:",
      e instanceof Error ? e.message : e,
    );
    return config;
  }
  if (!raw) return config;

  const platforms = pickFrom(raw.platforms, CONTROLLABLE_PLATFORMS, connectedPlatforms);
  const contentCategories = pickFrom(raw.content_categories, CONTENT_CATEGORIES);
  const postsPerWeek = pickInt(raw.posts_per_week, 1, 7);
  const postsPerDay = pickInt(raw.posts_per_day, 1, 5);
  const postHourUtc = pickInt(raw.post_hour_utc, 0, 23);
  const postDays = Array.isArray(raw.post_days)
    ? [...new Set(raw.post_days.filter((d): d is number => pickInt(d, 0, 6) !== null))].sort(
        (a, b) => a - b,
      )
    : null;

  if (typeof raw.reasoning === "string" && raw.reasoning.trim()) {
    console.info(`[social] AI autopilot plan: ${raw.reasoning.trim().slice(0, 200)}`);
  }

  // Merge: every field the AI didn't answer usably keeps its configured value.
  // `mode` is never taken from the AI — see the note at the top of this file.
  return {
    ...config,
    postsPerWeek: postsPerWeek ?? config.postsPerWeek,
    platforms: (platforms as ControllablePlatform[] | null) ?? config.platforms,
    contentCategories:
      (contentCategories as ContentCategory[] | null) ?? config.contentCategories,
    postsPerDay: postsPerDay ?? config.postsPerDay,
    postDays: postDays && postDays.length > 0 ? postDays : config.postDays,
    postHourUtc: postHourUtc ?? config.postHourUtc,
  };
}

import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

/**
 * "Let the AI decide" for a weekly-schedule slot: publish times, and topics.
 *
 * Both follow the same contract as planAutopilot.ts — they **fail soft**. A
 * planner outage must degrade to a sensible schedule, never to "post nothing"
 * and never to "post at a wild hour". Every function here returns a usable
 * answer even with no API key at all.
 */

const MODEL = "claude-sonnet-4-6";

/**
 * Fallback publish times, in minutes since local midnight. These are the
 * windows people actually check their feeds: before work, lunch, after work,
 * and evening. Used verbatim when the planner is unavailable, and as the
 * sanity net for anything it returns.
 */
const DEFAULT_WINDOWS = [8 * 60, 12 * 60, 17 * 60, 19 * 60, 21 * 60] as const;

export const MAX_POSTS_PER_DAY = 5;

/** Clamp to 1..MAX_POSTS_PER_DAY. */
export function clampPostsPerDay(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_POSTS_PER_DAY, Math.max(1, v));
}

/**
 * The times a slot fires on a given day, as minutes since local midnight,
 * ascending and de-duplicated.
 *
 * Fixed mode: the agent's chosen time is the FIRST post; any extras are spread
 * evenly through the rest of the day, ending by 21:00. Firing N posts at the
 * same minute would read as a bot, and stacking them at the end of the day
 * would miss the time the agent actually chose.
 *
 * A start at or after 21:00 has no room left to spread into, so extras fall
 * back to hourly and are clamped to 23:30.
 */
export function fixedSlotTimes(startMinutes: number, postsPerDay: number): number[] {
  const count = clampPostsPerDay(postsPerDay);
  const start = Math.min(23 * 60 + 59, Math.max(0, Math.floor(startMinutes)));
  if (count === 1) return [start];

  const END = 21 * 60;
  const out: number[] = [start];
  if (start >= END) {
    for (let i = 1; i < count; i++) out.push(Math.min(23 * 60 + 30, start + i * 60));
  } else {
    const step = Math.floor((END - start) / (count - 1));
    for (let i = 1; i < count; i++) out.push(Math.min(END, start + i * step));
  }
  return dedupeAscending(out);
}

/** The default AI times for a count, used when the planner cannot be reached. */
export function defaultAiSlotTimes(postsPerDay: number): number[] {
  const count = clampPostsPerDay(postsPerDay);
  // Spread across the windows rather than taking the first N, so 2 posts land
  // morning + evening instead of morning + lunch.
  if (count >= DEFAULT_WINDOWS.length) return [...DEFAULT_WINDOWS].slice(0, count);
  const picks: number[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(DEFAULT_WINDOWS[Math.round((i * (DEFAULT_WINDOWS.length - 1)) / Math.max(1, count - 1))]);
  }
  return dedupeAscending(picks);
}

function dedupeAscending(mins: number[]): number[] {
  return [...new Set(mins.map((m) => Math.min(23 * 60 + 59, Math.max(0, Math.floor(m)))))].sort((a, b) => a - b);
}

type RawTimes = { times?: unknown; reasoning?: unknown };

/**
 * Ask the planner for `postsPerDay` publish times on `weekdayLabel`.
 * Returns minutes since local midnight. Falls back to DEFAULT_WINDOWS on any
 * failure, malformed answer, or missing key.
 */
export async function planSlotTimes(input: {
  weekdayLabel: string;
  postsPerDay: number;
  platforms: readonly string[];
}): Promise<number[]> {
  const count = clampPostsPerDay(input.postsPerDay);
  if (!isAnthropicConfigured()) return defaultAiSlotTimes(count);

  const prompt = [
    `Choose ${count} publish time${count === 1 ? "" : "s"} for a residential real-estate agent's social post on ${input.weekdayLabel}.`,
    input.platforms.length ? `Platforms: ${input.platforms.join(", ")}.` : "",
    "",
    "Pick times in the agent's LOCAL timezone when their clients actually look at their feeds.",
    count > 1 ? "Space them out across the day - do not bunch them together." : "",
    "Stay between 07:00 and 21:30.",
    "",
    'Return ONLY JSON, no commentary: {"times": ["HH:MM", ...], "reasoning": "one short sentence"}',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (Array.isArray(res.content) ? res.content : [])
      .map((b) => ((b as { type?: string; text?: string }).type === "text" ? (b as { text?: string }).text ?? "" : ""))
      .join("");
    const parsed = extractJsonObject(text) as RawTimes | null;
    const times = Array.isArray(parsed?.times) ? (parsed!.times as unknown[]) : [];
    const minutes = times
      .map((t) => (typeof t === "string" ? parseHhMm(t) : null))
      .filter((m): m is number => m !== null);
    if (!minutes.length) return defaultAiSlotTimes(count);
    // Trust the planner's ordering but not its bounds or its count.
    const bounded = minutes.map((m) => Math.min(21 * 60 + 30, Math.max(7 * 60, m)));
    const unique = dedupeAscending(bounded).slice(0, count);
    // A planner that returned too few still gets topped up from the defaults,
    // so "3 posts a day" always means 3.
    if (unique.length < count) {
      return dedupeAscending([...unique, ...defaultAiSlotTimes(count)]).slice(0, count);
    }
    return unique;
  } catch (e) {
    console.warn("[weekly-social] time planning failed:", e instanceof Error ? e.message : e);
    return defaultAiSlotTimes(count);
  }
}

function parseHhMm(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
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

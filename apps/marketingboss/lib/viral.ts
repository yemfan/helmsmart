import "server-only";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, anthropicJson } from "@/lib/ai";

/**
 * Viral-reference finder for the UGC studio. Given what the user wants to
 * advertise, Claude web-searches for trending short-form video ads / UGC in that
 * niche, then a second pass distills them into a shortlist the creator can
 * emulate. Two steps for the same reason as research.ts: the web tools give
 * cited free-form prose, and structured output (which can't run with the tools)
 * turns that into JSON.
 *
 * Honest limit: this is discovery + emulation via public web search, not a live
 * scrape of TikTok's trending API (which is gated). Links may be examples or
 * write-ups rather than the exact clip.
 */

export type ViralRef = {
  /** A short name for the ad/creator concept. */
  title: string;
  /** Where it's trending (TikTok / Reels / Shorts / etc.). */
  platform: string;
  /** Why it works — the mechanic worth stealing. */
  why: string;
  /** The style of opening hook it uses. */
  hook: string;
  /** Concrete style/format notes to emulate (framing, pacing, tone, format). */
  styleNotes: string;
  /** A link to the example or a write-up (may be empty). */
  url: string;
};

type Block = { type: string; text?: string };

/** One web-search pass over the niche; returns cited free-form prose. */
async function scoutRaw(intent: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  const system =
    "You are a short-form social ad strategist who studies what's going viral RIGHT NOW. " +
    "Search the web for currently trending UGC-style / creator video ads and formats relevant to the user's product or niche. " +
    "Prefer recent, concrete examples: name the format or creator, the platform, WHY it performs (the hook mechanic, pacing, structure), " +
    "and how a small business could adapt it. Include a source URL for each when you can.";

  const messages: { role: string; content: unknown }[] = [
    {
      role: "user",
      content:
        `I want to make a short-form UGC video ad about:\n\n${intent}\n\n` +
        "Find 4-6 currently-trending short-form ad formats or viral creator videos I could emulate for this. " +
        "For each: what it is, the platform, why it works, the hook style, and concrete notes on how to replicate the format. " +
        "Favor things trending in the last few months.",
    },
  ];

  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
  ];

  let text = "";
  for (let i = 0; i < 6; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 6000, system: cachedSystem(system), messages, tools }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      content?: Block[];
      stop_reason?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message || `Search failed (${res.status}).`);
    if (data.stop_reason === "refusal") throw new Error("The AI declined this search. Try rephrasing your product.");

    text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text as string)
      .join("\n\n");

    if (data.stop_reason === "pause_turn" && data.content) {
      messages.push({ role: "assistant", content: data.content });
      // The turn just added holds the search results — cache it so the
      // next round reads them back instead of re-paying for them.
      markTranscriptCached(messages as never);
      continue;
    }
    break;
  }

  if (!text.trim()) throw new Error("Nothing came back — try describing the product differently.");
  return text;
}

const REFS_SCHEMA = {
  type: "object",
  properties: {
    refs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          platform: { type: "string" },
          why: { type: "string" },
          hook: { type: "string" },
          styleNotes: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "platform", "why", "hook", "styleNotes", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["refs"],
  additionalProperties: false,
};

/** Web-search the niche and return a shortlist of viral ads to emulate. */
export async function findViralAds(intent: string): Promise<ViralRef[]> {
  const scouted = await scoutRaw(intent);

  const system = [
    "You turn a web-research briefing about trending short-form ads into a clean shortlist.",
    "Return 4-6 distinct references, each with:",
    "- title: a short name for the format/concept.",
    "- platform: where it trends (TikTok / Reels / Shorts / etc.).",
    "- why: one sentence on why it performs.",
    "- hook: the opening-hook style it uses.",
    "- styleNotes: concrete, replicable notes (framing, pacing, tone, on-screen text, structure).",
    "- url: the source link if the briefing has one, else an empty string.",
    "Only include references actually supported by the briefing — do not invent links.",
  ].join("\n");

  const out = await anthropicJson<{ refs: ViralRef[] }>({
    system,
    user: `Product/niche:\n${intent}\n\nResearch briefing:\n${scouted}`,
    schema: REFS_SCHEMA,
    maxTokens: 2000,
  });
  return out.refs.slice(0, 6);
}

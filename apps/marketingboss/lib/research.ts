import "server-only";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, anthropicJson } from "@/lib/ai";

/**
 * Autopilot brand-research engine. Given a product/business link, Claude fetches
 * the page and web-searches the company + its competitors, then a second pass
 * distills that into a structured brand brief the content planner runs on.
 *
 * Two steps on purpose: step 1 uses the server web tools (free-form answer);
 * step 2 (no tools) constrains the output to JSON via structured outputs, which
 * can't be combined with the web tools' citations.
 */

export type Competitor = { name: string; angle: string };

export type BrandBrief = {
  name: string;
  summary: string;
  audience: string;
  tone: string;
  sellingPoints: string[];
  competitors: Competitor[];
  pillars: string[];
  suggestedHashtags: string[];
};

type Block = { type: string; text?: string };

/**
 * deep = the autopilot's market research (broad web search for competitors).
 * fast = the URL-fill flow: read the site's OWN key pages first, search at
 * most twice — much quicker, since most business info lives on the site.
 */
export type ResearchMode = "deep" | "fast";

/** Likely key pages on a company site — web_fetch can only fetch URLs already in the conversation, so we list them. */
function candidatePages(link: string): string[] {
  try {
    const origin = new URL(link).origin;
    return [
      link,
      `${origin}/about`,
      `${origin}/about-us`,
      `${origin}/services`,
      `${origin}/products`,
      `${origin}/programs`,
      `${origin}/pricing`,
    ];
  } catch {
    return [link];
  }
}

/** One request against the Messages API with the web tools, resuming pause_turn. */
async function researchRaw(link: string, mode: ResearchMode): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  const system =
    mode === "fast"
      ? "You are a sharp marketing strategist working QUICKLY. The business's own site is your primary source: " +
        "fetch its key pages first (candidates are listed — skip any that 404). Use web search at most twice, and " +
        "only to fill real gaps (e.g. naming 2–3 competitors). Be concrete; do not pad."
      : "You are a sharp marketing strategist. Research the given business or product and its market. " +
        "Fetch the provided page first, then search the web to understand the offering, the target audience, " +
        "the positioning, and 2–4 direct competitors and how each markets itself. Be concrete and specific.";

  // web_fetch only fetches URLs already in the conversation — the link(s) are here.
  const messages: { role: string; content: unknown }[] = [
    {
      role: "user",
      content:
        mode === "fast"
          ? `Business site: ${link}\nKey pages you may fetch directly:\n${candidatePages(link).join("\n")}\n\n` +
            "Fetch the homepage plus the 2–3 most informative of those pages, then write a tight briefing: what they " +
            "offer, who it's for, their voice/positioning, their strongest selling points, and (if quickly findable) " +
            "2–3 competitors. Speed matters more than exhaustiveness."
          : `Business / product page: ${link}\n\n` +
            "Fetch that page, then research the company and its market. Cover: what they sell, who it's for, " +
            "their voice/positioning, their strongest selling points, and 2–4 real competitors with how each " +
            "one markets. Write a thorough briefing.",
    },
  ];

  const tools =
    mode === "fast"
      ? [
          { type: "web_search_20260209", name: "web_search", max_uses: 2 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
        ]
      : [
          { type: "web_search_20260209", name: "web_search", max_uses: 8 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
        ];

  let text = "";
  const maxRounds = mode === "fast" ? 4 : 6;
  for (let i = 0; i < maxRounds; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: mode === "fast" ? 4000 : 6000, system, messages, tools }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      content?: Block[];
      stop_reason?: string;
      role?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message || `Research failed (${res.status}).`);
    if (data.stop_reason === "refusal") throw new Error("The AI declined to research this link.");

    text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text as string)
      .join("\n\n");

    // The server ran the tool loop; if it paused mid-turn, resume by echoing back.
    if (data.stop_reason === "pause_turn" && data.content) {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }

  if (!text.trim()) throw new Error("Research came back empty — try a different link.");
  return text;
}

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    audience: { type: "string" },
    tone: { type: "string" },
    sellingPoints: { type: "array", items: { type: "string" } },
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, angle: { type: "string" } },
        required: ["name", "angle"],
        additionalProperties: false,
      },
    },
    pillars: { type: "array", items: { type: "string" } },
    suggestedHashtags: { type: "array", items: { type: "string" } },
  },
  required: ["name", "summary", "audience", "tone", "sellingPoints", "competitors", "pillars", "suggestedHashtags"],
  additionalProperties: false,
};

/** Research a link and return a structured brand brief for the campaign. */
export async function buildBrandBrief(link: string, opts?: { mode?: ResearchMode }): Promise<BrandBrief> {
  const research = await researchRaw(link, opts?.mode ?? "deep");

  const system = [
    "You turn a marketing research briefing into a structured brand brief for an automated social-media program.",
    "Fill every field from the research:",
    "- name: the brand/business name.",
    "- summary: one or two sentences on what they offer.",
    "- audience: who the marketing should target.",
    "- tone: the brand voice to write in.",
    "- sellingPoints: 3–6 concrete differentiators.",
    "- competitors: the named competitors and, for each, how they market (angle).",
    "- pillars: 4–6 recurring content themes the autopilot will rotate through (each a short phrase).",
    "- suggestedHashtags: 6–10 relevant hashtags without the # sign.",
  ].join("\n");

  return anthropicJson<BrandBrief>({
    system,
    user: `Source link: ${link}\n\nResearch briefing:\n${research}`,
    schema: BRIEF_SCHEMA,
    maxTokens: 2000,
  });
}

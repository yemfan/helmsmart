import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { GeneratedGuide } from "./types";

const MODEL = "claude-sonnet-4-6";

const metaSchema = z.object({
  time_estimate: z.string().default(""),
  people: z.string().default(""),
  tools: z.string().default(""),
});

const partSchema = z.object({
  code: z.string(),
  name_en: z.string(),
  name_zh: z.string().default(""),
  qty: z.number().int().nonnegative().default(1),
});

const stepSchema = z.object({
  title_en: z.string(),
  title_zh: z.string(),
  body_en: z.string(),
  body_zh: z.string(),
  tip_en: z.string(),
  tip_zh: z.string(),
  image_index: z.number().int().nullable().default(null),
});

const generatedSchema = z.object({
  meta_en: metaSchema,
  meta_zh: metaSchema,
  parts: z.array(partSchema),
  steps: z.array(stepSchema).min(1),
});

export interface GenerateInput {
  product_name: string;
  model_no?: string;
  notes?: string;
  extracted_manual_text?: string;
  image_urls: string[];
}

const SYSTEM_PROMPT = `You are a senior technical writer for consumer-product assembly and setup instructions.

You will receive product photos plus rough seller notes (and sometimes a messy factory manual). Produce a clean, ordered instruction guide.

OUTPUT RULES — follow exactly:
- Respond with STRICT JSON ONLY. No markdown, no code fences, no commentary before or after.
- Shape:
{
  "meta_en": {"time_estimate": "", "people": "", "tools": ""},
  "meta_zh": {"time_estimate": "", "people": "", "tools": ""},
  "parts": [{"code": "A", "name_en": "", "name_zh": "", "qty": 1}],
  "steps": [{"title_en": "", "title_zh": "", "body_en": "", "body_zh": "", "tip_en": "", "tip_zh": "", "image_index": 0}]
}

CONTENT RULES:
- 3 to 9 steps. One physical action per step. Imperative voice ("Insert the dowels", not "The dowels should be inserted").
- Each "body" is at most 2 sentences.
- Every step MUST include a practical, specific tip (tip_en / tip_zh) — the kind of thing an experienced assembler knows.
- Parts codes are single uppercase letters A, B, C, … in order.
- meta.time_estimate e.g. "About 25 minutes"; meta.people e.g. "2 people recommended"; meta.tools e.g. "Phillips screwdriver (hex key included)".
- "image_index" maps to the 0-based order of the input images; pick the best-fit image for each step, or null if none fits.
- Chinese (zh) fields must be natural, fluent Simplified Chinese written for a Chinese reader — NOT a literal word-for-word translation of the English.
- If the notes are thin, infer sensible, safe steps from the photos. Never invent unsafe instructions for electrical/gas/child products; keep those generic and add a caution tip.`;

function buildUserContent(input: GenerateInput): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  input.image_urls.slice(0, 20).forEach((url, i) => {
    blocks.push({ type: "text", text: `Image ${i} (index ${i}):` });
    blocks.push({ type: "image", source: { type: "url", url } });
  });
  const parts = [
    `Product name: ${input.product_name}`,
    input.model_no ? `Model number: ${input.model_no}` : "",
    input.notes ? `Seller notes:\n${input.notes}` : "",
    input.extracted_manual_text
      ? `Existing manual text (may be messy / poorly translated):\n${input.extracted_manual_text.slice(0, 12000)}`
      : "",
    `Now produce the strict JSON guide.`,
  ].filter(Boolean);
  blocks.push({ type: "text", text: parts.join("\n\n") });
  return blocks;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) return fence[1].trim();
  // If model wrapped JSON in prose, grab the outermost object.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

/**
 * Single Claude call → validated guide JSON. Retries once on parse/validation
 * failure with the error appended. Throws on final failure (caller surfaces a
 * friendly editor-side message).
 */
export async function generateGuide(input: GenerateInput): Promise<GeneratedGuide> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });
  const baseContent = buildUserContent(input);

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content: Anthropic.ContentBlockParam[] =
      attempt === 0
        ? baseContent
        : [
            ...baseContent,
            {
              type: "text",
              text: `Your previous response failed validation: ${lastErr}\nReturn corrected STRICT JSON only.`,
            },
          ];

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = JSON.parse(stripFences(text));
      const result = generatedSchema.parse(parsed);
      return result as GeneratedGuide;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`Generation failed to produce valid JSON: ${lastErr}`);
}

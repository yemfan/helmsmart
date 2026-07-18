import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { GeneratedGuide } from "./types";
import { LOCALES, LOCALE_ENGLISH_NAMES, type Locale } from "./locales";

const MODEL = "claude-sonnet-4-6";

// A localized-text object must include (at least) every requested locale.
function localizedSchema(locales: Locale[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const l of LOCALES) {
    shape[l] = locales.includes(l) ? z.string() : z.string().optional();
  }
  return z.object(shape).partial().and(
    // Ensure requested locales are present & non-empty.
    z.custom<Record<string, string>>((val) => {
      if (typeof val !== "object" || val === null) return false;
      const v = val as Record<string, unknown>;
      return locales.every((l) => typeof v[l] === "string" && (v[l] as string).length > 0);
    }, "missing a requested locale")
  );
}

function metaSchema(locales: Locale[]) {
  const inner = z.object({
    time_estimate: z.string().default(""),
    people: z.string().default(""),
    tools: z.string().default(""),
  });
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const l of locales) shape[l] = inner;
  return z.object(shape);
}

function generatedSchema(locales: Locale[]) {
  const loc = localizedSchema(locales);
  return z.object({
    name: loc,
    meta: metaSchema(locales),
    parts: z.array(
      z.object({ code: z.string(), qty: z.number().int().nonnegative().default(1), name: loc })
    ),
    steps: z
      .array(
        z.object({
          title: loc,
          body: loc,
          tip: loc,
          image_index: z.number().int().nullable().default(null),
        })
      )
      .min(1),
  });
}

export interface GenerateInput {
  product_name: string;
  model_no?: string;
  notes?: string;
  extracted_manual_text?: string;
  image_urls: string[];
  languages: Locale[];
}

function systemPrompt(locales: Locale[]): string {
  const names = locales.map((l) => `"${l}" (${LOCALE_ENGLISH_NAMES[l]})`).join(", ");
  const localeKeys = locales.map((l) => `"${l}"`).join(", ");
  const metaExample = locales
    .map((l) => `"${l}": {"time_estimate": "", "people": "", "tools": ""}`)
    .join(", ");
  const textExample = locales.map((l) => `"${l}": ""`).join(", ");
  return `You are a senior technical writer for consumer-product assembly and setup instructions, fluent in many languages.

You will receive product photos plus rough seller notes (and sometimes a messy factory manual). Produce a clean, ordered instruction guide, fully localized into these languages: ${names}.

OUTPUT RULES — follow exactly:
- Respond with STRICT JSON ONLY. No markdown, no code fences, no commentary.
- Every human-readable text field is an OBJECT keyed by locale, containing exactly these keys: ${localeKeys}.
- Shape:
{
  "name": {${textExample}},
  "meta": {${metaExample}},
  "parts": [{"code": "A", "qty": 1, "name": {${textExample}}}],
  "steps": [{"title": {${textExample}}, "body": {${textExample}}, "tip": {${textExample}}, "image_index": 0}]
}

CONTENT RULES:
- "name" is the product's display name per locale. Keep brand names and model numbers unchanged; localize only the descriptive part (e.g. "TV Stand" → "电视柜").
- 3 to 9 steps. One physical action per step. Imperative voice.
- Each "body" is at most 2 sentences. Every step includes a practical, specific tip.
- Parts codes are single uppercase letters A, B, C, … in order. "qty" is language-neutral.
- "image_index" maps to the 0-based order of the input images; best-fit per step, or null.
- Each localized value must be NATURAL, fluent text written by a native speaker of that language — NOT a literal word-for-word translation. Adapt phrasing, units, and idiom per language.
- Provide a value for EVERY requested locale on EVERY text field. Never omit a locale.
- Never invent unsafe instructions for electrical/gas/child products; keep those generic with a caution tip.`;
}

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
    `Now produce the strict JSON guide in all requested languages.`,
  ].filter(Boolean);
  blocks.push({ type: "text", text: parts.join("\n\n") });
  return blocks;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/**
 * Single Claude call → validated multi-locale guide JSON. Retries once on
 * parse/validation failure. Throws on final failure.
 */
export async function generateGuide(input: GenerateInput): Promise<GeneratedGuide> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const languages = input.languages.length ? input.languages : (["en"] as Locale[]);
  const client = new Anthropic({ apiKey });
  const baseContent = buildUserContent(input);
  const schema = generatedSchema(languages);
  const system = systemPrompt(languages);

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content: Anthropic.ContentBlockParam[] =
      attempt === 0
        ? baseContent
        : [
            ...baseContent,
            {
              type: "text",
              text: `Your previous response failed validation: ${lastErr}\nReturn corrected STRICT JSON only, with every requested locale on every field.`,
            },
          ];

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = JSON.parse(stripFences(text));
      return schema.parse(parsed) as GeneratedGuide;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`Generation failed to produce valid JSON: ${lastErr}`);
}

/* ---------------------------------------------------------------------------
 * Translation — used to add one language at a time to an existing guide, so
 * each request stays short (a single 6-language generation hit the 504 limit)
 * and the UI can report per-language progress.
 * ------------------------------------------------------------------------- */

export interface TranslatableGuide {
  name: string;
  meta: { time_estimate: string; people: string; tools: string };
  parts: { code: string; name: string }[];
  steps: { title: string; body: string; tip: string }[];
}

const translatableSchema = z.object({
  name: z.string(),
  meta: z.object({
    time_estimate: z.string().default(""),
    people: z.string().default(""),
    tools: z.string().default(""),
  }),
  parts: z.array(z.object({ code: z.string(), name: z.string() })),
  steps: z.array(z.object({ title: z.string(), body: z.string(), tip: z.string() })),
});

/** Translate one guide's text into `target`, preserving structure and part codes. */
export async function translateGuide(
  base: TranslatableGuide,
  target: Locale
): Promise<TranslatableGuide> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const client = new Anthropic({ apiKey });

  const system = `You localize consumer-product assembly instructions into ${LOCALE_ENGLISH_NAMES[target]}.

RULES:
- Respond with STRICT JSON ONLY — no markdown, no code fences, no commentary.
- Return exactly the same JSON shape you receive, with every text value rewritten in ${LOCALE_ENGLISH_NAMES[target]}.
- Keep the same number of parts and steps, in the same order.
- Keep each part's "code" EXACTLY as given (A, B, C…) — never translate codes.
- Keep brand names and model numbers unchanged; localize only descriptive text.
- Write natural, fluent ${LOCALE_ENGLISH_NAMES[target]} as a native technical writer would — NOT a literal word-for-word translation. Adapt idiom and units.`;

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const userText =
      attempt === 0
        ? JSON.stringify(base)
        : `${JSON.stringify(base)}\n\nYour previous response failed validation: ${lastErr}\nReturn corrected STRICT JSON only.`;

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = JSON.parse(stripFences(text));
      const result = translatableSchema.parse(parsed);
      // Structure must line up with the source so the merge stays aligned.
      if (result.parts.length !== base.parts.length || result.steps.length !== base.steps.length) {
        throw new Error("translated structure does not match the source");
      }
      return result as TranslatableGuide;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Translation failed: ${lastErr}`);
}

import "server-only";

/**
 * Shared JSON-extraction helpers for the AI engines (aiCma, aiPropertyLookup).
 *
 * Claude, under adaptive thinking + web search, may fence its final JSON answer,
 * emit it unfenced, narrate before it, or leave prose after the closing brace —
 * so `extractJson` tries several strategies. `repairJsonToObject` is the
 * last-ditch rescue: hand the model its own malformed output and ask for one
 * clean JSON object, rather than failing the whole run on a formatting hiccup.
 */

export function extractJson(text: string): Record<string, unknown> | null {
  for (const candidate of jsonCandidates(text)) {
    const obj = tryParseJson(candidate);
    if (obj) return obj;
  }
  return null;
}

/**
 * Yield JSON candidates in most-likely-final order: the LAST fenced block (the
 * final answer, not intermediate examples), then the last balanced {...} object,
 * then a crude first-brace/last-brace slice.
 */
function* jsonCandidates(text: string): Generator<string> {
  const fences: string[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (let m = fenceRe.exec(text); m; m = fenceRe.exec(text)) {
    if (m[1] && m[1].includes("{")) fences.push(m[1].trim());
  }
  for (let i = fences.length - 1; i >= 0; i--) yield fences[i];
  const balanced = lastBalancedObject(text);
  if (balanced) yield balanced;
  const crude = sliceFirstObject(text);
  if (crude) yield crude;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^[^{]*/, "") // drop any prose before the first {
    .replace(/[^}]*$/, "") // drop any prose after the last }
    .replace(/,\s*([}\]])/g, "$1"); // strip trailing commas
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Scan from the end for the last balanced {...} object (handles prose after). */
function lastBalancedObject(text: string): string | null {
  const end = text.lastIndexOf("}");
  if (end < 0) return null;
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{" && --depth === 0) return text.slice(i, end + 1);
  }
  return null;
}

function sliceFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

/**
 * Last-ditch JSON repair: hand the model its own (malformed) output and ask for
 * a single clean JSON object. No tools, low ceremony. `instruction` describes
 * the target shape and MUST tell the model to reuse only values already present.
 */
export async function repairJsonToObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  model: string,
  text: string,
  instruction: string,
): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create({
      model,
      max_tokens: 8000,
      system:
        "You reformat content into valid JSON. Output ONLY a single JSON object — no prose, no markdown fences, no commentary.",
      messages: [{ role: "user", content: `${instruction}\n\n${text.slice(0, 14000)}` }],
    });
    const out: unknown[] = Array.isArray(res?.content) ? res.content : [];
    let repaired = "";
    for (const block of out) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") repaired += b.text;
    }
    return extractJson(repaired);
  } catch {
    return null;
  }
}

// ── shared scalar coercers ───────────────────────────────────────

export function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Parse a numeric field, returning null (not 0) when absent/unknown. */
export function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

/** Trimmed string, or null when absent/blank. */
export function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/** Accept only a plausible http(s) URL. */
export function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const url = v.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

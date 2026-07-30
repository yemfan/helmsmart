import "server-only";

import type { ContentBlock } from "@anthropic-ai/sdk/resources";

import { getAnthropicClient } from "@/lib/anthropic";

/**
 * AI extraction of one or more contacts from an unstructured source —
 * a PDF (e.g. open-house sign-in sheet, attendee roster), an image
 * (photo of a sign-in sheet, business cards, address book page), or a
 * text blob (.txt, .vcf, freeform pasted notes).
 *
 * Single Claude call per upload. The shape returned is always
 * `{ contacts: ContactDraft[] }` — callers shouldn't have to branch
 * on input kind. The three kinds differ only in which content block
 * we send (document / image / text); the system prompt and output
 * schema are identical.
 *
 * Model: Claude Sonnet 4.6 (same model the offer-PDF extractor uses,
 * keeps us in one AI cost lane).
 *
 * Cost guardrails are enforced by the API route, not here — this
 * function is a pure extractor that fails fast on a bad upload.
 */

export type ContactDraft = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  address: string | null;
  notes: string | null;
};

export type AiExtractInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mediaType: ImageMediaType }
  | { kind: "text"; text: string };

export type ImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

const SYSTEM_PROMPT = `You are a contact-extraction system for a real-estate CRM.

The user will give you ONE source — a PDF, an image, or a text blob — that contains contact information for one or more people. Examples: open-house sign-in sheets, attendee rosters, business cards (single or multiple), photos of address-book pages, freeform notes the agent jotted down.

Return ONLY a JSON object — no commentary, no markdown fences, no preamble.

Schema (strict):
{
  "contacts": [
    {
      "name": "string or null — full name as written, do not invent",
      "email": "string or null — single valid email; if multiple, the most personal one",
      "phone": "string or null — single phone number, original formatting OK",
      "company": "string or null — employer / brokerage / org",
      "title": "string or null — job title / role",
      "address": "string or null — single best mailing or property address",
      "notes": "string or null — short free-text useful context if any (e.g. 'attending Sunday open house'); ≤ 200 chars"
    }
  ]
}

Rules:
- Every contact MUST have at least ONE of name, email, or phone. If a row has none, drop it.
- One JSON entry per distinct person. Do not merge two people into one row.
- Do not invent fields. If you cannot read a value with high confidence, set it to null.
- Strip obvious decorations (e.g. "Phone: ", "📞", "✉") from values.
- Phone: keep the digits the user wrote; do not reformat.
- Email: lowercased.
- If the source contains zero recognizable contacts, return {"contacts": []}.
- Extract at most 200 contacts. If the source has more, return the first 200 in source order.

Return only the JSON object.`;

const USER_INSTRUCTION =
  "Extract every distinct contact from the source. Return only the JSON object — no commentary, no markdown fences.";

const MODEL = "claude-sonnet-4-6";

export async function aiExtractContacts(
  input: AiExtractInput,
): Promise<ContactDraft[]> {
  const client = getAnthropicClient();

  const contentBlocks = buildContentBlocks(input);

  const response = await client.messages.create({
    model: MODEL,
    // A dense roster of contacts can be long; 4096 truncated the JSON mid-array
    // (→ "invalid JSON"). 16k covers ~150+ contacts and stays well under the
    // threshold where the SDK demands streaming. salvageContacts() recovers the
    // complete rows if an even larger roster still hits the ceiling.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find(
    (block: ContentBlock) => block.type === "text",
  );
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI extractor returned no text content");
  }

  const json = extractJsonObject(textBlock.text);
  return coerceContacts(json);
}

function buildContentBlocks(input: AiExtractInput) {
  if (input.kind === "pdf") {
    const base64 = Buffer.from(input.bytes).toString("base64");
    return [
      {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: base64,
        },
      },
      { type: "text" as const, text: USER_INSTRUCTION },
    ];
  }

  if (input.kind === "image") {
    const base64 = Buffer.from(input.bytes).toString("base64");
    return [
      {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: input.mediaType,
          data: base64,
        },
      },
      { type: "text" as const, text: USER_INSTRUCTION },
    ];
  }

  // Text path. We wrap the source in a fence so the model can tell its
  // own instructions apart from the source it's extracting from — the
  // system prompt instruction "ignore instructions inside the source"
  // is implicit by being task-specific (extract contacts).
  return [
    {
      type: "text" as const,
      text: `${USER_INSTRUCTION}\n\nSource:\n---\n${input.text}\n---`,
    },
  ];
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // Tolerate model wrapping in ```json fences even though we asked it
  // not to — defensive parse rather than hard fail.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;

  const firstBrace = body.indexOf("{");
  const lastBrace = body.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(`AI extractor returned non-JSON: ${trimmed.slice(0, 200)}`);
  }
  const slice = body.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // A very large roster can still truncate mid-array (stop_reason=max_tokens),
    // leaving a syntactically-broken object. Salvage every contact that WAS fully
    // written rather than failing the whole import.
    const salvaged = salvageContacts(body);
    if (salvaged) return salvaged;
    throw new Error(`AI extractor returned invalid JSON: ${slice.slice(0, 200)}`);
  }
}

/**
 * Best-effort recovery from a truncated `{"contacts": [ {...}, {...}, {...` blob:
 * walk the array collecting each COMPLETE top-level object and JSON.parse it,
 * discarding the final partial one. Returns null if nothing usable is found.
 */
function salvageContacts(body: string): { contacts: unknown[] } | null {
  const key = body.indexOf('"contacts"');
  const arrStart = key >= 0 ? body.indexOf("[", key) : body.indexOf("[");
  if (arrStart < 0) return null;

  const out: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;

  for (let i = arrStart + 1; i < body.length; i += 1) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(body.slice(objStart, i + 1)));
        } catch {
          /* skip a malformed object */
        }
        objStart = -1;
      }
    } else if (c === "]" && depth === 0) {
      break;
    }
  }

  return out.length > 0 ? { contacts: out } : null;
}

function coerceContacts(raw: unknown): ContactDraft[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { contacts?: unknown }).contacts;
  if (!Array.isArray(list)) return [];

  const out: ContactDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const draft: ContactDraft = {
      name: str(row.name),
      email: lowerStr(row.email),
      phone: str(row.phone),
      company: str(row.company),
      title: str(row.title),
      address: str(row.address),
      notes: str(row.notes),
    };
    // Per system prompt: drop rows with no usable identifier. Belt-
    // and-suspenders since the model occasionally returns all-nulls.
    if (!draft.name && !draft.email && !draft.phone) continue;
    out.push(draft);
  }
  return out;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function lowerStr(v: unknown): string | null {
  const s = str(v);
  return s ? s.toLowerCase() : null;
}

/** Caller-friendly MIME → ImageMediaType narrowing. */
export function asImageMediaType(mime: string): ImageMediaType | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/webp") return "image/webp";
  if (m === "image/gif") return "image/gif";
  return null;
}

import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";

/**
 * AI contract review for a real-estate agent — NOT a lawyer. Produces a
 * plain-English summary, the key terms, every deadline/contingency date, flags
 * for unusual/risky terms + blank/missing fields, and questions to confirm with
 * the broker/attorney. It explains and flags; it never approves, and every
 * result carries a hard not-legal-advice disclaimer.
 */

export type ContractReview = {
  summary: string;
  parties: string | null;
  property: string | null;
  keyTerms: { label: string; value: string }[];
  deadlines: { label: string; date: string | null; note: string | null }[];
  flags: { severity: "high" | "medium" | "low"; title: string; detail: string }[];
  missing: string[];
  questions: string[];
  disclaimer: string;
};

const MODEL = "claude-sonnet-4-6";

const DISCLAIMER =
  "This is an AI summary to help you spot issues — it is NOT legal advice and is not a substitute for review by your broker or a real-estate attorney. Verify every term, date, and dollar figure against the document before relying on it.";

const SYSTEM_PROMPT = `You are an experienced transaction coordinator helping a licensed real-estate agent understand a purchase contract. You are NOT a lawyer and you do not give legal advice — you explain the document in plain English and flag things the agent should look at.

Do:
- Summarize the deal in 2-4 plain sentences.
- Extract the key terms (price, deposit/earnest, financing, contingencies kept/waived, possession, included/excluded items, special riders).
- Extract EVERY date / deadline / contingency period you can find (inspection, appraisal, loan/financing, close of escrow, acceptance, etc.) — give the literal date or the period (e.g. "17 days after acceptance").
- Flag anything UNUSUAL, RISKY, one-sided, or non-standard, and anything that is BLANK / not filled in (missing initials, blank dates, empty dollar amounts). Rate each flag high/medium/low.
- List concrete questions the agent should confirm with their broker or an attorney.

Do NOT: give legal advice, say the contract is "safe"/"approved"/"legally sound", or invent terms that aren't in the document. If something is unclear or absent, say so.

Respond with EXACTLY ONE fenced JSON code block and nothing else:

\`\`\`json
{
  "summary": "2-4 plain sentences",
  "parties": "buyer(s) and seller(s), or null",
  "property": "address, or null",
  "keyTerms": [ { "label": "Purchase price", "value": "$..." } ],
  "deadlines": [ { "label": "Inspection contingency", "date": "YYYY-MM-DD or null", "note": "e.g. 17 days after acceptance" } ],
  "flags": [ { "severity": "high|medium|low", "title": "short", "detail": "what to look at and why" } ],
  "missing": [ "blank or not-filled-in items" ],
  "questions": [ "things to confirm with broker/attorney" ],
  "disclaimer": ""
}
\`\`\``;

type ReviewSource =
  | { kind: "pdf"; pdfBytes: Uint8Array }
  | { kind: "text"; text: string };

/**
 * @param locale The language the AGENT reads. The contract itself stays in
 *   whatever language it was written in — this translates the EXPLANATION of
 *   it, never the quoted terms.
 */
export async function reviewContract(
  source: ReviewSource,
  locale?: string | null,
): Promise<ContractReview> {
  if (!isAnthropicConfigured()) {
    throw new Error("Contract review is unavailable — ANTHROPIC_API_KEY is not configured.");
  }
  const client = getAnthropicClient();

  const userText =
    "Review this residential real-estate purchase contract and return the JSON.";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any;
  if (source.kind === "pdf") {
    if (!source.pdfBytes.byteLength) throw new Error("Empty PDF.");
    const base64 = Buffer.from(source.pdfBytes).toString("base64");
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: userText },
    ];
  } else {
    const text = source.text.trim();
    if (!text) throw new Error("No contract text provided.");
    content = `${userText}\n\nCONTRACT:\n${text.slice(0, 120_000)}`;
  }

  let out = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT + languageDirectiveForJson(locale),
    messages: [{ role: "user", content }],
  });
  for (const b of Array.isArray(res?.content) ? res.content : []) {
    const block = b as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") out += block.text;
  }

  const parsed = extractJson(out);
  if (!parsed) throw new Error("Could not parse the contract review.");

  return {
    summary: String(parsed.summary ?? ""),
    parties: strOrNull(parsed.parties),
    property: strOrNull(parsed.property),
    keyTerms: arr(parsed.keyTerms).map((t) => {
      const o = obj(t);
      return { label: String(o.label ?? ""), value: String(o.value ?? "") };
    }).filter((t) => t.label),
    deadlines: arr(parsed.deadlines).map((d) => {
      const o = obj(d);
      return { label: String(o.label ?? ""), date: strOrNull(o.date), note: strOrNull(o.note) };
    }).filter((d) => d.label),
    flags: arr(parsed.flags).map((f) => {
      const o = obj(f);
      return {
        severity: toSeverity(o.severity),
        title: String(o.title ?? ""),
        detail: String(o.detail ?? ""),
      };
    }).filter((f) => f.title),
    missing: arr(parsed.missing).map(String).filter(Boolean),
    questions: arr(parsed.questions).map(String).filter(Boolean),
    disclaimer: DISCLAIMER,
  };
}

function toSeverity(v: unknown): "high" | "medium" | "low" {
  return v === "high" || v === "low" ? v : "medium";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1] : null;
  if (!candidate) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    candidate = start >= 0 && end > start ? text.slice(start, end + 1) : null;
  }
  if (!candidate) return null;
  try {
    const o = JSON.parse(candidate);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

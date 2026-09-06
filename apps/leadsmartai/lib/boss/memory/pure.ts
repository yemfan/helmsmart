/**
 * Max memory — the pure parts (no server-only import so tests can load them).
 *
 * A memory is one sentence Max should still know next week: a preference the
 * realtor stated, a decision they made, who a nickname refers to. See
 * ./store.ts for persistence and ./extract.ts for the post-run pass.
 */

export const MEMORY_KINDS = ["preference", "decision", "person", "fact"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type MemoryNote = {
  id: string;
  content: string;
  kind: MemoryKind;
  source: "max" | "agent";
  created_at: string;
};

/** Longest note the table accepts; longer input is trimmed, not rejected. */
export const MEMORY_MAX_CHARS = 400;
/** How many notes ride along in the system prompt (newest first). */
export const MEMORY_PROMPT_LIMIT = 30;

export function isMemoryKind(v: unknown): v is MemoryKind {
  return typeof v === "string" && (MEMORY_KINDS as readonly string[]).includes(v);
}

/** Collapse whitespace and trim to the column limit. Empty when nothing is left. */
export function cleanContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MEMORY_MAX_CHARS);
}

/**
 * Two notes are the same note when they match ignoring case, punctuation and
 * a trailing full stop — "Always text Mrs Chen after 5pm." and "always text
 * mrs. chen after 5pm" should not both exist.
 */
export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDuplicate(candidate: string, existing: readonly string[]): boolean {
  const n = normalizeForCompare(candidate);
  if (!n) return true;
  return existing.some((e) => normalizeForCompare(e) === n);
}

/**
 * Parse the extraction model's reply. It is asked for JSON only, but a model
 * that wraps it in prose or a code fence should still parse; anything that
 * isn't a well-formed note is dropped rather than saved half-right.
 */
export function parseExtractedNotes(text: string): Array<{ kind: MemoryKind; content: string }> {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ kind: MemoryKind; content: string }> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const content = cleanContent((item as { content?: unknown }).content);
    if (content.length < 8) continue;
    const kind = (item as { kind?: unknown }).kind;
    out.push({ kind: isMemoryKind(kind) ? kind : "fact", content });
    if (out.length >= 3) break;
  }
  return out;
}

/** The block the system prompt carries — empty string when there is nothing to say. */
export function memoryPromptBlock(notes: readonly Pick<MemoryNote, "content" | "kind" | "created_at">[]): string {
  if (notes.length === 0) return "";
  const lines = notes.map((n) => `  - [${n.kind}] ${n.content}`);
  return (
    `\n\nWhat you know about this realtor — durable notes saved by you or by them in earlier sessions, newest first. Treat them as true unless the realtor contradicts one now. When they say "remember …" or state a lasting preference or decision, save it with remember_note (one sentence, no duplicates of what is here). When they say "forget …" or a note is wrong, call forget_note. Never say you cannot remember earlier sessions.\n` +
    lines.join("\n")
  );
}

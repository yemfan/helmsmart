/**
 * The wire between `/api/ask` and the Ask Mark panel: newline-delimited JSON,
 * one event per line. Text streams as it is written; a proposal arrives as
 * the card to render. No directive and no server imports — both ends import
 * this.
 */
import type { ApprovalView } from "./approval-view";

export type AskEvent =
  | { t: "text"; v: string }
  | { t: "proposal"; approval: ApprovalView }
  | { t: "error"; v: string };

export const ASK_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeAskEvent(event: AskEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function parseLine(line: string): AskEvent | null {
  if (!line.trim()) return null;
  try {
    const v = JSON.parse(line) as Partial<AskEvent> & Record<string, unknown>;
    if (v.t === "text" && typeof v.v === "string") return { t: "text", v: v.v };
    if (v.t === "error" && typeof v.v === "string") return { t: "error", v: v.v };
    if (v.t === "proposal" && v.approval && typeof v.approval === "object") return { t: "proposal", approval: v.approval as ApprovalView };
  } catch {
    // A torn or foreign line is dropped, not shown.
  }
  return null;
}

/** Feed it decoded chunks; it hands back whole events and holds a partial line until the rest arrives. */
export function createAskEventParser() {
  let buffer = "";
  return {
    push(chunk: string): AskEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.map(parseLine).filter((e): e is AskEvent => e !== null);
    },
    flush(): AskEvent[] {
      const last = parseLine(buffer);
      buffer = "";
      return last ? [last] : [];
    },
  };
}

/** How a proposal's state reads to Mark on the next turn (the model's language, not the owner's). */
const STATE_FOR_MODEL: Record<string, string> = {
  proposed: "waiting for the owner's approval",
  approved: "approved by the owner",
  executed: "approved by the owner and sent",
  declined: "declined by the owner",
  failed: "approved by the owner but not sent",
  expired: "expired without a decision",
  unconfirmed:
    "approved by the owner, but it could not be confirmed whether it was sent — do not propose it again until the owner has checked the conversation",
};

/**
 * The panel's conversation as the turns `/api/ask` expects. An answer that
 * carried proposals says what became of each, so "change the text to Priya"
 * or "did Dana's reminder go?" has something to refer to.
 */
export function historyForModel(
  messages: ReadonlyArray<{ role: "user" | "assistant"; content: string; proposals?: ApprovalView[] }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.proposals?.length) return { role: m.role, content: m.content };
    // A dismissed unconfirmed send is stored as failed, but it may have gone out.
    const notes = m.proposals
      .map((p) => `[${p.summary} — ${(p.dismissed ? STATE_FOR_MODEL.unconfirmed : STATE_FOR_MODEL[p.status]) ?? p.status}]`)
      .join("\n");
    return { role: m.role, content: m.content.trim() ? `${m.content}\n\n${notes}` : notes };
  });
}

export const ASK_MAX_MESSAGES = 30;
export const ASK_MAX_CHARS = 8_000;

/**
 * The conversation the panel sent, as something safe to hand the model: only
 * user/assistant turns with text, the most recent ones, starting with the
 * owner and ending with their question. Empty when there is nothing to answer.
 */
export function sanitizeHistory(raw: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .map((m) => m as { role?: unknown; content?: unknown })
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: (m.content as string).slice(0, ASK_MAX_CHARS) }))
    .slice(-ASK_MAX_MESSAGES);
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return [];
  return turns;
}

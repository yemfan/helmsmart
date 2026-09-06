import "server-only";

import { z } from "zod";
import { defineTool } from "../types";
import { addMemory, archiveMatching } from "../../memory/store";
import { MEMORY_KINDS } from "../../memory/pure";

/**
 * remember_note / forget_note — Max's notebook (UX audit Phase 4).
 *
 * The realtor says "remember that I never show homes on Sundays" and Max
 * writes it down; it rides along in every later system prompt (see
 * lib/boss/memory). "Forget the Sunday thing" archives it. Both are visible
 * and editable under Settings › AI team › What Max remembers.
 */
export const rememberNote = defineTool({
  name: "remember_note",
  description:
    "Save one durable note about this realtor for future sessions: an explicit preference (\"always…\", \"never…\", \"I prefer…\"), a decision they made, or who/what a name refers to (\"my Rosewood seller is Grace Bennett\"). Use when the realtor says \"remember…\" or states something that should still be true next week. One plain sentence with names, not pronouns. Not for routine task details, not for inferences, not for anything already in your notes.",
  inputSchema: z.object({
    content: z.string().min(4).max(400).describe("The note, one sentence, understandable months later."),
    kind: z.enum(MEMORY_KINDS).optional().describe("preference | decision | person | fact (default fact)."),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    const r = await addMemory({
      agentId: ctx.agentId,
      content: input.content,
      kind: input.kind ?? "fact",
      source: "max",
      sourceRunId: ctx.runId,
    });
    if (r.status === "empty") return { status: "failed", error: "The note was empty." };
    if (r.status === "duplicate") {
      return {
        status: "completed",
        summary: `Already in my notes: "${input.content}"`,
        display: { key: "memory.alreadyKnown", params: { note: input.content } },
        data: { duplicate: true },
      };
    }
    return {
      status: "completed",
      summary: `Noted: "${r.note.content}"`,
      display: { key: "memory.saved", params: { note: r.note.content } },
      data: { id: r.note.id },
    };
  },
});

export const forgetNote = defineTool({
  name: "forget_note",
  description:
    "Remove notes from your memory of this realtor. Use when they say \"forget…\", correct something you had saved, or a saved note is no longer true. Pass a short phrase that appears in the note(s) to remove; every active note containing it is archived.",
  inputSchema: z.object({
    query: z.string().min(2).max(200).describe("A phrase contained in the note(s) to forget, e.g. \"Sundays\" or \"Mrs. Chen\"."),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    const removed = await archiveMatching(ctx.agentId, input.query);
    if (removed.length === 0) {
      return {
        status: "completed",
        summary: `No note matched "${input.query}" — nothing to forget.`,
        display: { key: "memory.nothingToForget", params: { query: input.query } },
        data: { removed: 0 },
      };
    }
    return {
      status: "completed",
      summary: `Forgot ${removed.length} note${removed.length === 1 ? "" : "s"}: ${removed.map((n) => `"${n.content}"`).join("; ")}`,
      display: { key: "memory.forgot", params: { count: removed.length } },
      data: { removed: removed.length, notes: removed.map((n) => n.content) },
    };
  },
});

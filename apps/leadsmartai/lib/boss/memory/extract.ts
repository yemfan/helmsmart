import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { BOSS_MEMORY_MODEL } from "@/lib/ai/config";
import { addMemory, listMemories } from "./store";
import { parseExtractedNotes } from "./pure";

/**
 * After a mission completes, ask a small model whether anything in it is
 * worth carrying into future sessions, and save what qualifies.
 *
 * Conservative on purpose. Most missions yield nothing: "draft a text to
 * David" is routine, not memory. What qualifies is what the realtor STATED
 * or DECIDED — "always text Mrs. Chen after 5pm", "we're listing Rosewood at
 * $1.2M", "my Rosewood seller is Grace Bennett". Inferences are never saved;
 * a wrong note is worse than a missing one, and every note is visible and
 * removable under Settings › AI team, so the realtor can correct the record.
 *
 * Off with BOSS_MEMORY_EXTRACT=off. Never throws — a failure here must not
 * touch the run that already finished.
 */
export async function extractMemoriesFromRun(run: {
  id: string;
  agent_id: string;
  objective: string;
  report?: string | null;
  trigger?: string | null;
}): Promise<number> {
  try {
    const flag = (process.env.BOSS_MEMORY_EXTRACT ?? "").toLowerCase();
    if (flag === "off" || flag === "false" || flag === "0") return 0;
    if (!isAnthropicConfigured()) return 0;
    // Overnight runs are Max talking to himself; nothing the realtor said.
    if (run.trigger === "overnight") return 0;
    const objective = (run.objective ?? "").trim();
    if (objective.length < 12) return 0;

    const existing = await listMemories(run.agent_id, 60);
    const known = existing.length
      ? `\n\nAlready saved (do not repeat or rephrase these):\n${existing.map((n) => `- ${n.content}`).join("\n")}`
      : "";

    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: BOSS_MEMORY_MODEL,
      max_tokens: 400,
      system:
        "You keep the notebook of Max, an AI chief of staff for one real estate agent. From a finished mission, extract at most 3 notes worth knowing in FUTURE sessions: explicit preferences (always/never/prefer), decisions the realtor made, and who's-who or what's-what references (a nickname for a client or property, a price they set). Only what the realtor stated or decided in their own words — never inferences, never routine task details, never facts about the world, never anything already saved. Each note is one plain sentence under 200 characters, written so it is still understandable months later (use names, not 'this lead'). Reply with JSON only: an array of {\"kind\":\"preference\"|\"decision\"|\"person\"|\"fact\",\"content\":\"...\"}. Reply [] when nothing qualifies — that is the usual answer.",
      messages: [
        {
          role: "user",
          content:
            `Realtor's request:\n${objective.slice(0, 2000)}\n\nMax's report back:\n${(run.report ?? "").trim().slice(0, 3000) || "(none)"}` +
            known,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const notes = parseExtractedNotes(text);
    let saved = 0;
    for (const n of notes) {
      const r = await addMemory({ agentId: run.agent_id, content: n.content, kind: n.kind, source: "max", sourceRunId: run.id });
      if (r.status === "added") saved++;
    }
    return saved;
  } catch (e) {
    console.warn("[boss-memory] extraction failed:", e);
    return 0;
  }
}

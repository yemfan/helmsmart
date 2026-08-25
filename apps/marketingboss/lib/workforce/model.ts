import "server-only";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL } from "@/lib/ai";

/**
 * The tool-calling model client for Nina's loop.
 *
 * lib/ai.ts already speaks to Anthropic over raw fetch, but every call there is
 * a one-shot structured-JSON request — it has no notion of tools or of a
 * multi-turn transcript. This adds exactly that, in the same dependency-free
 * style, and reuses ai.ts's endpoint and model constants so there is still one
 * place to change the model.
 *
 * Injectable (see ModelClient) so the engine can be driven by a fake in tests.
 */

export type ModelToolUse = { id: string; name: string; input: unknown };

export type ModelResponse = {
  /** Text blocks, concatenated. */
  text: string;
  toolUses: ModelToolUse[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Raw assistant content blocks — appended to the transcript verbatim. */
  rawContent: unknown[];
};

export type ModelClient = {
  createMessage(args: {
    system: string;
    messages: unknown[];
    tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    maxTokens: number;
  }): Promise<ModelResponse>;
};

type ContentBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown };

export function createModelClient(): ModelClient {
  return {
    async createMessage({ system, messages, tools, maxTokens }) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system,
          messages,
          tools,
          // Planning which specialist to use and in what order is real reasoning
          // — unlike the one-shot copywriting calls in ai.ts, which run "low".
          output_config: { effort: "medium" },
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        content?: ContentBlock[];
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      };

      if (!res.ok) {
        // 429 and 5xx are worth retrying; the engine decides, so surface the code.
        throw new Error(data.error?.message || `The AI service returned an error (${res.status}).`);
      }

      const content = data.content ?? [];
      return {
        text: content
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim(),
        toolUses: content
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input })),
        stopReason: data.stop_reason ?? null,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        rawContent: content,
      };
    },
  };
}

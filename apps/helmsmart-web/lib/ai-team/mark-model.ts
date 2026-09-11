/**
 * The real model behind `MarkModel`: one streamed Messages API call per round.
 * Text deltas go to the owner as they arrive; the final message (tool calls,
 * thinking blocks and all) goes back into the transcript unchanged.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { MARK_AGENT_MODEL, type MarkModel } from "./mark-loop";

export function anthropicMarkModel(client: Anthropic, model: string = MARK_AGENT_MODEL): MarkModel {
  return {
    async turn({ system, tools, messages, maxTokens }, onText) {
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: system as Anthropic.TextBlockParam[],
        tools: tools as Anthropic.Tool[],
        messages: messages as Anthropic.MessageParam[],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
      }
      const final = await stream.finalMessage();
      return {
        content: final.content as unknown as Record<string, unknown>[],
        text: final.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join(""),
        toolUses: final.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
          .map((b) => ({ id: b.id, name: b.name, input: b.input })),
        stopReason: final.stop_reason ? String(final.stop_reason) : null,
        usage: final.usage,
      };
    },
  };
}

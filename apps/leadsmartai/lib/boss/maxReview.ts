import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";
import { parseMaxVerdict, type MaxReview } from "@/lib/boss/maxVerdict";

/**
 * Max proofreads an outbound message before it goes.
 *
 * He is not a second author and he is not a censor. He asks one question — is
 * this going to reflect badly on the realtor? — and answers it four ways:
 *
 *   reject   — it would do damage. Send it back to be written again.
 *   fix      — a typo, a clumsy line, a missing name. Correct it and pass it.
 *   escalate — he is not sure. That is the realtor's call, not his.
 *   approve  — nothing wrong with it.
 *
 * The bias is deliberate: when Max cannot tell, he escalates rather than
 * guessing. A tier that quietly waves through the thing it was unsure about is
 * worse than no tier at all, because the realtor stops reading on the assumption
 * that something else is.
 *
 * Never throws. On any failure the caller falls back to asking the realtor —
 * the safe direction, since the alternative is sending unreviewed text on the
 * strength of a review that didn't happen.
 */
export async function maxReviewDraft(input: {
  channel: "sms" | "email";
  body: string;
  /** What the message is meant to achieve, so Max can judge fit as well as form. */
  intent: string;
  recipientName?: string | null;
  brandName?: string | null;
}): Promise<MaxReview> {
  const system = `You are Max, the head of a real estate professional's AI team. One of your assistants has drafted a message to a client. You are the last read before it goes out.

Your ONE question: would this message have a negative impact on the realtor — their reputation, their client relationship, or their legal position?

Answer with exactly one verdict:
- "reject" — it would do real damage: a factual claim we cannot stand behind, a promise only the realtor can make, a price or market opinion (that needs a licence), pressure or guilt, anything that reads as spam, or a tone that would embarrass them. Say why, in one line.
- "fix" — the substance is fine but the form is off: a typo, an awkward sentence, a missing or wrong name, a greeting that doesn't match the language of the message. Return the corrected message in "body". Change as little as possible — you are proofreading, not rewriting.
- "escalate" — you are genuinely unsure, or the call belongs to the realtor (a sensitive situation, an unusual request, a judgement about this specific relationship). Never guess in order to avoid escalating.
- "approve" — nothing wrong with it.

Bias: when in doubt, escalate. Waving through something you were unsure about is worse than asking.

Output ONLY a JSON object: { "verdict": "approve" | "fix" | "escalate" | "reject", "body": string | null, "reason": "string" }`;

  const user = [
    `Channel: ${input.channel}`,
    `Goal of the message: ${input.intent}`,
    input.recipientName ? `Recipient: ${input.recipientName}` : null,
    input.brandName ? `Sent as: ${input.brandName}` : null,
    "",
    "Message:",
    input.body,
    "",
    "Review it now. Return only the JSON object.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const response = await getAnthropicClient().messages.create({
      model: BOSS_AGENT_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    });
    const tb = response.content.find((b) => b.type === "text");
    if (!tb || tb.type !== "text") {
      return { verdict: "escalate", reason: "Max couldn't read this one — over to you." };
    }
    return parseMaxVerdict(tb.text, input.channel);
  } catch (e) {
    console.error("[max-review] failed:", e instanceof Error ? e.message : e);
    return { verdict: "escalate", reason: "Max couldn't review this one — over to you." };
  }
}

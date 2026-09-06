import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { buildListingCaption, type ListingCaptionInput } from "@/lib/social/captionBuilder";

/**
 * Write a listing caption with Claude, falling back to the deterministic one.
 *
 * The compose modal used to open with an empty textarea: the caption existed
 * only inside the POST handler, so the agent saw a blank box and had to write
 * the post themselves — or send it blank and discover what got published
 * afterwards. This is what fills it.
 *
 * FACTS ONLY. The prompt is given the same fields `buildListingCaption` uses
 * and is told never to invent price, specs or features, because this text is
 * published to the public under the agent's own name and licence. An invented
 * "newly renovated" is a misrepresentation with their licence attached to it.
 *
 * NEVER THROWS, and never returns empty. Any failure — no API key, a timeout,
 * a refusal, an empty completion — falls back to `buildListingCaption`, which
 * is the caption this feature shipped with. A slow or missing model degrades
 * the copy; it must not leave the agent staring at the blank box again.
 */
export async function draftListingCaption(
  input: ListingCaptionInput,
): Promise<{ caption: string; source: "ai" | "template" }> {
  const fallback = buildListingCaption(input).caption;

  const specs = [
    input.beds != null ? `${input.beds} bed` : null,
    input.baths != null ? `${input.baths} bath` : null,
    input.sqft != null ? `${input.sqft.toLocaleString()} sqft` : null,
    input.listPrice != null ? `$${Number(input.listPrice).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const where = [input.propertyAddress, input.city, input.state].filter(Boolean).join(", ");

  /*
   * The status has to be stated, not left to the model to guess.
   *
   * Given only an address and a price it reaches for the commonest listing
   * post there is and writes "#JustListed" — which it did, on a property that
   * was under contract with a closing date three weeks out.
   */
  const STATUS_BRIEF: Record<NonNullable<ListingCaptionInput["listingStatus"]>, string> = {
    on_market: "FOR SALE and taking showings. Do not claim it is newly or 'just' listed — you do not know how long it has been on the market.",
    under_contract:
      "UNDER CONTRACT — already in escrow. Do NOT write 'just listed', '#JustListed', 'for sale', or invite offers. Celebrate the milestone or thank the parties; you may invite people to ask about similar homes.",
    sold: "SOLD and closed. Write about it in the past tense. Do NOT imply it is available or invite tours of it.",
  };

  try {
    const res = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system:
        "You are a real-estate agent writing ONE Facebook post about your own listing. " +
        "Use ONLY the facts given — never invent price, specs, condition, or features, and never " +
        "describe the neighbourhood's schools, safety or demographics. Warm and specific, not " +
        "salesy: 2-3 short sentences, then a call to action, then 3-5 hashtags. " +
        "The STATUS line below is binding: never write a caption that contradicts it, and " +
        "pick a call to action and hashtags that fit it. " +
        "Sign off as the agent when a name is given. " +
        "Return ONLY the post text.",
      messages: [
        {
          role: "user",
          content:
            `Listing: ${where || "a home"}\n` +
            `Specs: ${specs || "(none given)"}\n` +
            `Hook the agent typed: ${input.hook?.trim() || "(none — choose your own opening)"}\n` +
            `Status: ${input.listingStatus ? STATUS_BRIEF[input.listingStatus] : "(unknown — do not state or imply any status)"}
` +
            `Agent: ${input.agentName ?? "(unnamed)"}` +
            (input.agentBrokerage ? ` at ${input.agentBrokerage}` : ""),
        },
      ],
    });
    const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)
      ?.text?.trim();
    if (text) return { caption: text.slice(0, 1500), source: "ai" };
  } catch {
    // Deliberately swallowed — see the contract above.
  }
  return { caption: fallback, source: "template" };
}

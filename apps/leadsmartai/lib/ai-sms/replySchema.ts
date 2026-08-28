/**
 * Response schema for the SMS assistant.
 *
 * Its own module so it can be tested without importing service.ts, which
 * constructs the OpenAI client. The rules it has to satisfy are not obvious
 * and breaking them fails at RUNTIME with a 400 — see the test.
 */

export const replyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    replyText: { type: "string" },
    inferredIntent: {
      type: "string",
      enum: [
        "buyer_listing_inquiry",
        "buyer_financing",
        "seller_home_value",
        "seller_list_home",
        "support",
        "appointment",
        "unknown",
      ],
    },
    // Strict structured output demands that EVERY key in `properties` appears in
    // `required` — including nested objects. `required: []` here made OpenAI
    // reject the whole request with a 400, so every AI reply fell through to the
    // fallback script. Optionality is expressed as a nullable type instead,
    // which is the only way strict mode allows it.
    extractedData: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        propertyAddress: { type: ["string", "null"] },
        timeline: { type: ["string", "null"] },
        budget: { type: ["number", "null"] },
      },
      required: ["name", "email", "propertyAddress", "timeline", "budget"],
    },
    nextBestAction: {
      type: "string",
      enum: [
        "continue_ai",
        "notify_agent",
        "schedule_call",
        "send_valuation_link",
        "send_listing_link",
      ],
    },
    hotLead: { type: "boolean" },
    needsHuman: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
  },
  // extractedData included for the same reason: strict mode requires every
  // property, not just the ones we cannot do without.
  required: [
    "replyText",
    "inferredIntent",
    "extractedData",
    "nextBestAction",
    "hotLead",
    "needsHuman",
    "tags",
  ],
} as const;

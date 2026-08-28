export type SmsAssistantIntent =
  | "buyer_listing_inquiry"
  | "buyer_financing"
  | "seller_home_value"
  | "seller_list_home"
  | "support"
  | "appointment"
  | "unknown";

export type SmsLeadSnapshot = {
  leadId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  leadScore?: number | null;
  leadTemperature?: string | null;
  propertyAddress?: string | null;
  city?: string | null;
  state?: string | null;
  intent?: string | null;
  assignedAgentId?: string | null;
  /**
   * BCP-47 base id (e.g. "zh", "en") sourced from
   * `contacts.preferred_language`. Null when the contact has no override
   * and the agent's `default_outbound_language` should win.
   * Validated through `lib/locales/registry.coerceLocale` at the resolver.
   */
  preferredLanguage?: string | null;
};

export type SmsReplyContext = {
  fromPhone: string;
  toPhone: string;
  inboundBody: string;
  lead: SmsLeadSnapshot | null;
  recentMessages: Array<{
    direction: "inbound" | "outbound";
    body: string;
    createdAt: string;
  }>;
  inferredIntent: SmsAssistantIntent;
};

export type SmsAssistantReply = {
  replyText: string;
  inferredIntent: SmsAssistantIntent;
  extractedData?: {
    // Nullable: strict structured output cannot mark a field optional, so the
    // model returns null for anything the caller did not mention.
    name?: string | null;
    email?: string | null;
    propertyAddress?: string | null;
    timeline?: string | null;
    budget?: number | null;
  };
  nextBestAction:
    | "continue_ai"
    | "notify_agent"
    | "schedule_call"
    | "send_valuation_link"
    | "send_listing_link";
  hotLead: boolean;
  needsHuman: boolean;
  tags: string[];
};

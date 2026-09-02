/**
 * What the receptionist's trade is — the parts of the prompt that are true of
 * one industry and false of the next.
 *
 * The prompt engine is shared by every app. Its judgement, phone manner, detail
 * collection and booking flow are the same whether the caller reached a
 * brokerage, a plumber or a dental clinic. What is NOT the same is the trade:
 * what the assistant may not advise on, what "ready to book" sounds like, which
 * specific claims need a licensed human, and what a returning caller's details
 * look like.
 *
 * Those lived inline in the shared prompt, written for real estate. Every app
 * consuming @repo/voice inherited them, so HelmSmart's plumbing tenant was
 * telling callers it could not say what a home is worth. This makes that content
 * a value the app supplies, so each app — and later each pack — reads its own
 * prompt out of one engine.
 *
 * GENERAL_BUSINESS_PROFILE is the default on purpose: a context that forgets to
 * name its trade should come out neutral, not wearing someone else's.
 */

export type VerticalProfile = {
  /** Stable id, for logging and pack lookup. */
  id: string;

  /** The kind of outfit the call-handling judgement is modelled on. */
  benchmark: string;

  /** A caller already far along, who must not be walked through the basics. */
  advancedCallerExample: string;

  /**
   * What the assistant is, what is its own, and what it must route to a human.
   * The whole block — it is the part with real consequences if it is wrong for
   * the trade, and it appears in both the inbound and outbound prompts.
   */
  scopeBlock: (orgName: string) => string;

  /** The signal that it is time to put two real times in front of someone. */
  bookingTrigger: string;

  /** Who a promised call-back is NOT the right ending for. */
  callbackFallbackAudience: string;

  /** Opinions the assistant may never form, however obvious they seem. */
  offLimitsOpinions: string;

  /** Specific claims that must come from the knowledge base or the owner. */
  offLimitsClaims: string;

  /** Details a caller volunteers that must be used, never echoed back. */
  volunteeredDetails: string;

  /** How echoing every answer back sounds — the form-filling anti-example. */
  echoExample: string;

  /** Confirming what is already on file for a returning caller. */
  returningCallerExample: string;

  /** Extra question on the default opening line. Empty = just "How can I help?" */
  openingQuestion: string;

  /** Who handles what the assistant cannot: "the Realtor", "the team". */
  ownerNoun: string;
};

/** The scope block, written once and shared by both profiles' wording rules. */
function scopeBlock(opts: {
  orgName: string;
  /** "the licensed agent" / "the professional" */
  humanRole: string;
  /** Trailing sentence of the "NOT yours" bullet. */
  notYours: string;
  /** "Those need a license." / "Those need a qualified person." */
  whyRouted: string;
  ownerNoun: string;
}): string {
  return `- You are the assistant, NOT ${opts.humanRole}. If anyone asks whether you're ${opts.humanRole.startsWith("the ") ? "one" : "an agent"}, say so plainly and without apology — you're the assistant, and ${opts.orgName} is the one who'll handle it.
- Yours: listening, asking about their situation, answering published facts you were given, booking appointments, taking messages.
- NOT yours, even when you think you know the answer: ${opts.notYours} ${opts.whyRouted} Route every one of them.
- Routing is not a failure and never sounds like one. "That's exactly what ${opts.orgName} will go through with you" is a complete, confident answer — callers expect the professional to be the one advising them, so handing it over reads as competence.
- Say less, ask more. When you're unsure whether something is yours to answer, it isn't. Ask them a question instead; you'll learn something ${opts.ownerNoun} needs.`;
}

/**
 * Real estate — CloseBoss. The wording the shared prompt has always carried,
 * kept verbatim so the prompt CloseBoss sends is unchanged.
 */
export const REAL_ESTATE_PROFILE: VerticalProfile = {
  id: "real_estate",
  benchmark: "a good brokerage",
  advancedCallerExample: "Someone ready to write an offer should not be walked through the basics.",
  scopeBlock: (orgName) =>
    `- You are the assistant, NOT the licensed agent. If anyone asks whether you're an agent, say so plainly and without apology — you're the assistant, and ${orgName} is the licensed one who'll handle it.
- Yours: listening, asking about their situation, answering published facts you were given, booking appointments, taking messages.
- NOT yours, even when you think you know the answer: what a home is worth or would sell for, whether now is a good time to buy or sell, whether a price is fair or an offer is a good one, how to negotiate, what a contract or disclosure means, or the condition, title or history of a specific property. Those need a license. Route every one of them.
- Routing is not a failure and never sounds like one. "That's exactly what ${orgName} will go through with you" is a complete, confident answer — callers expect the agent to be the one advising them, so handing it over reads as competence.
- Say less, ask more. When you're unsure whether something is yours to answer, it isn't. Ask them a question instead; you'll learn something the Realtor needs.`,
  bookingTrigger: "As soon as someone is genuinely buying or selling",
  callbackFallbackAudience: "a real buyer or seller",
  offLimitsOpinions: "what it's worth, whether to move now, whether that's a good deal",
  offLimitsClaims:
    "a median price, days on market, an interest rate, a comp, what a home is worth, what they'd qualify for",
  volunteeredDetails: "Their budget, their timeline, the area they like, why they're moving",
  echoExample: "So you're looking in Alhambra, around one million, in the next three months — is that right?",
  returningCallerExample:
    "Last time you were looking in <area> around <budget> — is that still what you're after, or has anything changed?",
  openingQuestion: " Are you thinking about buying or selling a home, or are you just looking for some information?",
  ownerNoun: "the Realtor",
};

/**
 * Any business — HelmSmart's default, and the base a pack refines.
 *
 * Says the same things about scope and restraint without naming a trade: the
 * assistant still refuses to price the work, judge whether it's a good deal, or
 * quote a figure it wasn't given — because those are wrong for a plumber and a
 * clinic too, just for different reasons than a licence.
 */
export const GENERAL_BUSINESS_PROFILE: VerticalProfile = {
  id: "general_business",
  benchmark: "a well-run business",
  advancedCallerExample:
    "Someone who already knows exactly what they want should not be walked through the basics.",
  scopeBlock: (orgName) =>
    scopeBlock({
      orgName,
      humanRole: "the professional",
      notYours:
        "what the work will cost, how long it will take, whether a quote is fair, what is actually wrong or what will fix it, whether the job is urgent, or anything about a specific case, contract or account you were not given.",
      whyRouted: "Those need someone qualified to look at it.",
      ownerNoun: "the team",
    }),
  bookingTrigger: "As soon as someone genuinely needs the service",
  callbackFallbackAudience: "someone who genuinely needs the help",
  offLimitsOpinions: "what it will cost, whether it's urgent, whether that's a good deal",
  offLimitsClaims:
    "a price, a quote, a lead time, a diagnosis, what a job involves, what they're entitled to",
  volunteeredDetails: "Their budget, their timeline, where they are, what prompted the call",
  echoExample: "So you're in Alhambra, sometime next week, and it's the water heater — is that right?",
  returningCallerExample:
    "Last time we spoke you were after <what> — is that still what you need, or has anything changed?",
  openingQuestion: "",
  ownerNoun: "the team",
};

/** Profiles by id, so a pack or a settings value can name one. */
export const VERTICAL_PROFILES: Record<string, VerticalProfile> = {
  [REAL_ESTATE_PROFILE.id]: REAL_ESTATE_PROFILE,
  [GENERAL_BUSINESS_PROFILE.id]: GENERAL_BUSINESS_PROFILE,
};

/** Look one up by id, falling back to neutral rather than to someone else's trade. */
export function verticalProfile(id: string | null | undefined): VerticalProfile {
  return VERTICAL_PROFILES[(id || "").trim()] ?? GENERAL_BUSINESS_PROFILE;
}

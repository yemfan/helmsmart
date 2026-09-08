/**
 * Should an inbound call that reached no known contact create a new one?
 *
 * The receptionist used to save every caller. That is right for a person
 * who rang about a listing and wrong for the other kind of inbound call: the
 * hang-up after twelve seconds, and the recorded "press 2 for a specialist"
 * robocall. Twenty-one of the agent's contacts were those, each shown as an
 * unnamed "new" lead beside real people.
 *
 * The call itself is always kept in the call log. This only decides whether
 * it also earns a contact row.
 */
export type CallSignals = {
  /** Name the caller gave, if any. */
  name?: string | null;
  /** buyer / seller / renter / other, from the extraction. */
  partyType?: string | null;
  /** A stated timeline ("this spring") is intent even without a party type. */
  timeline?: string | null;
  /** Total call length. null when unknown — treated as long enough. */
  durationSeconds?: number | null;
  /** The AI call summary. */
  summary: string;
};

/** Below this the caller said nothing that survives a transcript. */
export const MIN_CONVERSATION_SECONDS = 15;

/**
 * Phrases the summariser uses for a recorded message rather than a person.
 * Deliberately narrow: every entry describes a machine talking, not a topic
 * a real caller might raise.
 */
const RECORDED_MESSAGE = [
  /\bpress\s+(?:\d|one|two|three|nine|star|pound)\b/i,
  /\b(?:automated|pre-?recorded|recorded)\s+(?:message|call|voice)\b/i,
  /\bleft a (?:recorded|automated) message\b/i,
  /\bthis is not a sales call\b/i,
  /\b(?:extended|auto|vehicle|car)\s+warranty\b/i,
  /\bloan approval\b/i,
  /\bspeak (?:with|to) a specialist\b/i,
];

export function looksLikeRecordedMessage(summary: string): boolean {
  const s = summary.trim();
  if (!s) return false;
  return RECORDED_MESSAGE.some((re) => re.test(s));
}

export function callWorthAContact(c: CallSignals): boolean {
  // A person who gave a name, or said what they are (buyer, seller, renter),
  // or when they are acting, is a lead regardless of length.
  if ((c.name ?? "").trim()) return true;
  const party = (c.partyType ?? "").toLowerCase();
  if (party === "buyer" || party === "seller" || party === "renter") return true;
  if ((c.timeline ?? "").trim()) return true;

  // A machine is never a contact.
  if (looksLikeRecordedMessage(c.summary)) return false;

  // Nothing identifying, and the call was too short for a conversation.
  if (typeof c.durationSeconds === "number" && c.durationSeconds < MIN_CONVERSATION_SECONDS) {
    return false;
  }

  // Someone talked for a while and gave nothing to go on. Keep them: a real
  // person the agent may want to call back is worth an unnamed row.
  return true;
}

/**
 * What the receptionist can book, and which of it to offer whom.
 *
 * Until now `typesText` was one hardcoded English sentence — "property
 * showings, buyer consultations, listing consultations, and general meetings"
 * — read to every caller regardless of who they were. A seller ringing about
 * what their house is worth was offered a showing; a buyer was offered a
 * listing consultation. And whatever the caller picked was kept only inside a
 * free-text title, so nothing downstream could count or filter by it.
 *
 * Two dimensions, deliberately kept apart:
 *
 *   PURPOSE  what the meeting is for — consultation, valuation, showing
 *   MODE     how it happens — in person, phone, video
 *
 * "Buyer consultation" and "video meeting" are not alternatives; a buyer
 * consultation can BE a video meeting. Collapsing them into one list is what
 * makes booking flows ask silly questions ("consultation or video call?").
 * Kept apart, the caller is asked what they want and — only when it matters —
 * how, and any mode can attach to any purpose that supports it.
 *
 * Not every pairing is real, which is why each purpose carries its own list
 * rather than all three being assumed: a property showing cannot happen over
 * the phone, and offering it would be worse than not offering a mode at all.
 *
 * Pure: no I/O, so the offer rules can be tested without a call.
 */

export type AppointmentMode = "in_person" | "phone" | "video";

/** Who a purpose is for. `both` covers renters and unknown callers too. */
export type AppointmentAudience = "buyer" | "seller" | "both";

export type BookableAppointmentType = {
  id: string;
  /** What the receptionist says. */
  label: string;
  labelZh: string;
  audience: AppointmentAudience;
  /** Modes this purpose can genuinely happen in. The first is the default. */
  modes: AppointmentMode[];
  minutes: number;
};

/** How each mode is spoken. */
export const APPOINTMENT_MODES: Record<AppointmentMode, { label: string; labelZh: string }> = {
  in_person: { label: "in person", labelZh: "当面" },
  phone: { label: "phone", labelZh: "电话" },
  video: { label: "video", labelZh: "视频" },
};

/**
 * Ordered by how often a caller wants each. Emma reads the first few, so the
 * order is the offer.
 */
export const APPOINTMENT_TYPES: BookableAppointmentType[] = [
  {
    id: "buyer_consultation",
    label: "buyer consultation",
    labelZh: "购房咨询",
    audience: "buyer",
    modes: ["in_person", "video", "phone"],
    minutes: 30,
  },
  {
    id: "showing",
    label: "property showing",
    labelZh: "看房",
    audience: "buyer",
    // In person only. You cannot show a house down the phone.
    modes: ["in_person"],
    minutes: 30,
  },
  {
    id: "seller_consultation",
    label: "seller consultation",
    labelZh: "卖房咨询",
    audience: "seller",
    modes: ["in_person", "video", "phone"],
    minutes: 30,
  },
  {
    id: "home_valuation",
    label: "home valuation",
    labelZh: "房屋估值",
    audience: "seller",
    // In person is the real one; a desktop valuation over video or phone is a
    // legitimate lighter version, so both stay available.
    modes: ["in_person", "video", "phone"],
    minutes: 30,
  },
  {
    id: "general_meeting",
    label: "general meeting",
    labelZh: "一般会面",
    audience: "both",
    modes: ["in_person", "video", "phone"],
    minutes: 30,
  },
];

export type CallerKind = "buyer" | "seller" | "renter" | "unknown";

/** Normalise whatever `contacts.lead_type` holds into the kinds we branch on. */
export function callerKind(leadType: string | null | undefined): CallerKind {
  const t = String(leadType ?? "").trim().toLowerCase();
  if (t === "buyer" || t === "seller" || t === "renter") return t;
  return "unknown";
}

/**
 * What to offer this caller.
 *
 * A known buyer is not read the seller options and vice versa — that is the
 * whole point. An unknown caller gets everything, because guessing wrong is
 * worse than a slightly longer list, and a renter gets the buyer side, which
 * is what actually applies to them.
 */
export function offerableAppointmentTypes(kind: CallerKind): BookableAppointmentType[] {
  if (kind === "unknown") return APPOINTMENT_TYPES;
  const wanted: AppointmentAudience = kind === "seller" ? "seller" : "buyer";
  return APPOINTMENT_TYPES.filter((t) => t.audience === wanted || t.audience === "both");
}

/** Look a purpose up by id. */
export function appointmentTypeById(id: string): BookableAppointmentType | undefined {
  return APPOINTMENT_TYPES.find((t) => t.id === id);
}

/**
 * Map whatever the agent said back onto a known purpose.
 *
 * The booking tool takes a free-text `typeName`, so this is what keeps the
 * stored value countable instead of forty spellings of "showing". Returns null
 * rather than guessing when nothing matches — an unrecognised label is better
 * recorded as absent than as the wrong thing.
 */
export function normalizeAppointmentType(
  raw: string | null | undefined,
): BookableAppointmentType | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;

  const byId = APPOINTMENT_TYPES.find((t) => t.id === text.replace(/[\s-]+/g, "_"));
  if (byId) return byId;

  const byLabel = APPOINTMENT_TYPES.find(
    (t) => text.includes(t.label) || text.includes(t.labelZh),
  );
  if (byLabel) return byLabel;

  // Common ways a caller or the agent phrases each one.
  const hints: Array<[RegExp, string]> = [
    [/valuation|appraisal|what.*worth|估值|评估/, "home_valuation"],
    [/listing consult|list my|sell my|selling|卖/, "seller_consultation"],
    [/showing|tour|walk through|walkthrough|view the|看房/, "showing"],
    [/buyer|buying|purchase|买/, "buyer_consultation"],
    [/meeting|meet|appointment|会面|见面/, "general_meeting"],
  ];
  for (const [pattern, id] of hints) {
    if (pattern.test(text)) return appointmentTypeById(id) ?? null;
  }
  return null;
}

/**
 * Which mode the caller asked for, if they said.
 *
 * Separate from the purpose on purpose: "a video call about selling" names
 * both, and each has to land in its own column.
 */
export function normalizeAppointmentMode(
  raw: string | null | undefined,
): AppointmentMode | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/video|zoom|facetime|google meet|视频/.test(text)) return "video";
  if (/phone|call me|over the phone|电话/.test(text)) return "phone";
  if (/in person|in-person|face to face|come in|当面|见面/.test(text)) return "in_person";
  return null;
}

/**
 * The mode to record, given what was asked for and what the purpose allows.
 *
 * A request the purpose cannot honour falls back to its default rather than
 * being stored — "phone showing" is not a thing, and writing it down would
 * make the calendar lie.
 */
export function resolveAppointmentMode(
  type: BookableAppointmentType,
  requested: AppointmentMode | null,
): AppointmentMode {
  if (requested && type.modes.includes(requested)) return requested;
  return type.modes[0];
}

/**
 * The sentence the receptionist is given.
 *
 * Durations are spelled out because the prompt asks her to speak them as
 * words; "15" read aloud as "one five" is a real thing that happened.
 */
export function describeAppointmentTypes(types: BookableAppointmentType[]): string {
  if (types.length === 0) {
    return "No online appointment booking. If the caller wants to schedule, take a message or offer a call-back.";
  }

  const listed = types
    .map((t) => {
      const modes = t.modes.map((m) => APPOINTMENT_MODES[m].label).join(" or ");
      return `${t.label} (thirty minutes, ${modes})`;
    })
    .join("; ");

  const fixedMode = types.filter((t) => t.modes.length === 1);
  const caveat = fixedMode.length
    ? ` A ${fixedMode.map((t) => t.label).join(" and a ")} is ${APPOINTMENT_MODES[fixedMode[0].modes[0]].label} by definition, so do not ask about that one.`
    : "";

  return (
    `Appointments you can book: ${listed}. ` +
    "Offer the one that fits what they actually want rather than reading the list. " +
    "Ask whether they'd like it in person, by phone, or over video only when more than one applies." +
    caveat +
    " Use check_availability first, then book_appointment, passing what you agreed as typeName and the mode as meetingMode. " +
    'Always speak durations and times as words (say "thirty minutes", never "three zero").'
  );
}

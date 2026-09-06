import {
  PUBLIC_WORKFORCE_TYPES,
  type HubConfig,
  type PublicWorkforceType,
  type WorkforceMember,
} from "./config";

/**
 * Which AI team members a hub may show, and in what state.
 *
 * "Only show what exists" is the rule, enforced with real signals:
 *
 *   - the agent's `ai_assistants` row for the type must be active (they can
 *     pause an assistant in the dashboard, and a paused one must not be
 *     advertised);
 *   - the receptionist additionally needs `voice_receptionist_settings.enabled`
 *     — an "AI receptionist that answers calls" with no phone line is a claim
 *     the page cannot back.
 *
 * The agent then chooses, per member, whether the public sees it and what it
 * says. Their choice can hide an available member; it can never show an
 * unavailable one.
 *
 * Pure: the caller supplies the availability facts.
 */

export type WorkforceAvailability = {
  /** ai_assistants rows by type: status and the name the agent gave it. */
  assistants: Partial<Record<PublicWorkforceType, { status: "active" | "paused"; name: string; avatarId: string; avatarUrl: string | null }>>;
  receptionistEnabled: boolean;
  bookingEnabled: boolean;
};

export type PublicWorkforceMember = {
  type: PublicWorkforceType;
  /** The persona name the agent gave this assistant — "Emma". */
  name: string;
  avatarId: string;
  avatarUrl: string | null;
  /** Agent-written public blurb, or null → translated default for the type. */
  description: string | null;
};

/** Default visibility when the agent has not configured the section. */
const DEFAULT_VISIBLE: Record<PublicWorkforceType, boolean> = {
  receptionist: true,
  sales_assistant: true,
  marketing_assistant: true,
  transaction_assistant: true,
  // Internal to the agent's own books; opt-in to show.
  accountant: false,
};

export function isTypeAvailable(type: PublicWorkforceType, a: WorkforceAvailability): boolean {
  const row = a.assistants[type];
  if (!row || row.status !== "active") return false;
  if (type === "receptionist" && !a.receptionistEnabled) return false;
  return true;
}

/** The members to render, in roster order. */
export function publicWorkforce(
  config: HubConfig,
  availability: WorkforceAvailability,
): PublicWorkforceMember[] {
  if (!config.workforce.enabled) return [];
  const chosen = new Map(config.workforce.members.map((m) => [m.type, m]));
  const out: PublicWorkforceMember[] = [];
  for (const type of PUBLIC_WORKFORCE_TYPES) {
    if (!isTypeAvailable(type, availability)) continue;
    const pick = chosen.get(type);
    const visible = pick ? pick.visible : DEFAULT_VISIBLE[type];
    if (!visible) continue;
    const row = availability.assistants[type]!;
    out.push({
      type,
      name: row.name,
      avatarId: row.avatarId,
      avatarUrl: row.avatarUrl,
      description: pick?.description ?? null,
    });
  }
  return out;
}

/**
 * The editor's view: every roster type with whether it is available, whether
 * it is currently shown, and why it cannot be shown when it cannot.
 */
export function workforceEditorRows(
  config: HubConfig,
  availability: WorkforceAvailability,
): Array<
  WorkforceMember & {
    available: boolean;
    unavailableReason: "paused" | "receptionist_off" | "missing" | null;
    name: string;
  }
> {
  const chosen = new Map(config.workforce.members.map((m) => [m.type, m]));
  return PUBLIC_WORKFORCE_TYPES.map((type) => {
    const row = availability.assistants[type];
    const pick = chosen.get(type);
    let reason: "paused" | "receptionist_off" | "missing" | null = null;
    if (!row) reason = "missing";
    else if (row.status !== "active") reason = "paused";
    else if (type === "receptionist" && !availability.receptionistEnabled) reason = "receptionist_off";
    return {
      type,
      visible: pick ? pick.visible : DEFAULT_VISIBLE[type],
      description: pick?.description ?? null,
      available: reason === null,
      unavailableReason: reason,
      name: row?.name ?? "",
    };
  });
}

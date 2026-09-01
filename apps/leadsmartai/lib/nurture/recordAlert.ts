/**
 * Record a nurture alert — the in-app half of "tell the agent about this".
 *
 * This exists because the table had never held a row. Twelve call sites wrote
 * to it, every one of them failed on a NOT NULL column no writer supplied, and
 * every one of them was wrapped in `catch {}`. The screens that read it showed
 * an empty list, which is indistinguishable from having nothing to say.
 *
 * The schema is fixed now, so the point of routing everything through here is
 * that the NEXT breakage cannot be silent: a rejected insert is logged with the
 * reason. Still non-throwing, because failing to note an alert must not fail
 * the reply or the webhook that triggered it — but non-throwing is not the same
 * as unspeaking, and conflating the two is what cost this feature its entire
 * lifetime.
 *
 * The client is a required argument rather than defaulting to supabaseAdmin:
 * importing that module builds a Supabase client at load time, which a unit
 * test cannot do, and this is logic worth testing.
 */

/** Just enough of a Supabase client to insert a row. */
type InsertableClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

export type NurtureAlert = {
  contactId: string;
  /** Bigint agent id; call sites often hold it as a string. */
  agentId: string | number | null | undefined;
  type: string;
  message: string;
};

/**
 * An agent id is a bigint. Call sites hold it as `String(row.agent_id)`, which
 * is what a `uuid` column used to choke on.
 */
function toAgentId(value: NurtureAlert["agentId"]): number | string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

/** @returns whether the alert was actually stored. */
export async function recordNurtureAlert(
  alert: NurtureAlert,
  client: InsertableClient,
): Promise<boolean> {
  if (!alert.contactId) {
    console.error("[nurture_alerts] refusing to record an alert with no contact");
    return false;
  }

  try {
    const { error } = await client.from("nurture_alerts").insert({
      agent_id: toAgentId(alert.agentId),
      contact_id: alert.contactId,
      type: alert.type,
      message: alert.message,
    });
    if (error) {
      console.error("[nurture_alerts] could not record the alert:", error, {
        type: alert.type,
        contactId: alert.contactId,
      });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[nurture_alerts] could not record the alert:", e, {
      type: alert.type,
      contactId: alert.contactId,
    });
    return false;
  }
}

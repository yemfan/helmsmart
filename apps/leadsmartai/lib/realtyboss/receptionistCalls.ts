import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { listRecentCalls, type CallLogEntry } from "@/lib/missed-call/service";

/**
 * The Receptionist console's call list: every call, enriched with
 * what the AI did about it — contact created, appointment set,
 * follow-up task created, text-back sent, call-back ladder state.
 * One batched query per action source; matching happens in JS over
 * the (≤ limit) window.
 */

export type CallAction = {
  kind:
    | "contact_created"
    | "appointment_set"
    | "task_created"
    | "textback_sent"
    | "callback"
    | "personal_reminder";
  label: string;
  href?: string;
};

export type CallbackState = {
  status: "scheduled" | "answered" | "exhausted" | "cancelled";
  attempts: number;
  next_attempt_at: string | null;
};

export type ReceptionistCall = CallLogEntry & {
  /** Human-readable reason/summary for the table cell. */
  reason: string;
  actions: CallAction[];
  callback: CallbackState | null;
};

const last10 = (p: string | null | undefined) =>
  (p ?? "").replace(/\D/g, "").slice(-10);

/** Strip the bookkeeping prefixes the voice flows write into notes. */
function deriveReason(c: CallLogEntry): string {
  const n = (c.notes ?? "").trim();
  if (n.startsWith("AI call summary:")) return n.slice("AI call summary:".length).trim();
  if (n.startsWith("Automatic call-back")) return "Returning their missed call";
  if (n.startsWith("AI outbound call placed")) return "Outbound AI call";
  if (n.startsWith("AI inbound call answered")) return "Inbound call";
  if (c.status === "missed") return "Caller didn't reach you";
  return n || (c.direction === "inbound" ? "Inbound call" : "Outbound call");
}

export async function listReceptionistCalls(
  agentId: string,
  limit = 100,
): Promise<ReceptionistCall[]> {
  const calls = await listRecentCalls(agentId, limit);
  if (calls.length === 0) return [];

  const oldest = calls[calls.length - 1].created_at;
  const sids = new Set<string>();
  const contactIds = new Set<string>();
  for (const c of calls) {
    if (c.contact_id) contactIds.add(c.contact_id);
  }

  // The provider call id lives on the row but listRecentCalls doesn't
  // return it — fetch the id→sid map for the same window in one query.
  const { data: sidRows } = await supabaseAdmin
    .from("call_logs")
    .select("id, twilio_call_sid")
    .eq("agent_id", agentId)
    .gte("created_at", oldest);
  const sidByCallId = new Map<string, string>();
  for (const r of (sidRows ?? []) as { id: string; twilio_call_sid: string | null }[]) {
    if (r.twilio_call_sid) {
      sidByCallId.set(r.id, r.twilio_call_sid);
      sids.add(r.twilio_call_sid);
    }
  }

  const [tasksRes, apptsRes, contactsRes, callbacksRes] = await Promise.all([
    // Follow-up tasks the AI created from calls (metadata carries the call id).
    supabaseAdmin
      .from("crm_tasks")
      .select("id, title, metadata_json")
      .eq("agent_id", agentId)
      .eq("source", "ai_call")
      .gte("created_at", oldest),
    // Appointments booked on calls — matched by caller phone + time window.
    supabaseAdmin
      .from("voice_appointments")
      .select("id, caller_phone, title, start_at, created_at")
      .eq("agent_id", agentId)
      .gte("created_at", oldest),
    // Contacts the receptionist created (vs. pre-existing ones it matched).
    contactIds.size > 0
      ? supabaseAdmin
          .from("contacts")
          .select("id, source, created_at, lifecycle_stage, relationship_type")
          .in("id", Array.from(contactIds))
      : Promise.resolve({ data: [] as unknown[] }),
    supabaseAdmin
      .from("receptionist_callbacks")
      .select("phone_e164, status, attempts, next_attempt_at, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const taskBySid = new Map<string, { id: string; title: string }>();
  for (const t of (tasksRes.data ?? []) as {
    id: string;
    title: string;
    metadata_json: Record<string, unknown> | null;
  }[]) {
    const sid = t.metadata_json?.twilio_call_sid;
    if (typeof sid === "string" && sids.has(sid)) taskBySid.set(sid, t);
  }

  const appts = ((apptsRes.data ?? []) as {
    id: string;
    caller_phone: string | null;
    title: string | null;
    start_at: string;
    created_at: string;
  }[]).map((a) => ({ ...a, digits: last10(a.caller_phone) }));

  const contactMeta = new Map<
    string,
    { source: string | null; created_at: string; personal: boolean }
  >();
  for (const c of (contactsRes.data ?? []) as {
    id: string;
    source: string | null;
    created_at: string;
    lifecycle_stage: string | null;
    relationship_type: string | null;
  }[]) {
    contactMeta.set(c.id, {
      source: c.source,
      created_at: c.created_at,
      personal: c.lifecycle_stage === "sphere" || c.relationship_type === "sphere",
    });
  }

  // Latest ladder per caller phone.
  const callbackByDigits = new Map<string, CallbackState>();
  for (const cb of (callbacksRes.data ?? []) as {
    phone_e164: string;
    status: CallbackState["status"];
    attempts: number;
    next_attempt_at: string | null;
  }[]) {
    const d = last10(cb.phone_e164);
    if (d && !callbackByDigits.has(d)) {
      callbackByDigits.set(d, {
        status: cb.status,
        attempts: cb.attempts,
        next_attempt_at: cb.next_attempt_at,
      });
    }
  }

  return calls.map((c) => {
    const sid = sidByCallId.get(c.id);
    const callerDigits = last10(c.direction === "inbound" ? c.from_phone : c.to_phone);
    const callTime = new Date(c.created_at).getTime();
    const actions: CallAction[] = [];

    // Personal (sphere) caller — the receptionist reminds the
    // Realtor to call back personally instead of treating it as a lead.
    const personal = c.contact_id ? (contactMeta.get(c.contact_id)?.personal ?? false) : false;
    if (personal && c.direction === "inbound") {
      actions.push({ kind: "personal_reminder", label: "Personal — reminder sent to you" });
    }

    // Contact created by the AI on (or right around) this call.
    if (c.contact_id) {
      const meta = contactMeta.get(c.contact_id);
      const createdNearCall =
        meta &&
        Math.abs(new Date(meta.created_at).getTime() - callTime) < 2 * 60 * 60 * 1000;
      const aiSource =
        (meta?.source ?? "").toLowerCase().replace(/\s+/g, "_") === "ai_receptionist";
      if (aiSource && createdNearCall) {
        actions.push({
          kind: "contact_created",
          label: "Contact created",
          href: `/dashboard/leads/${c.contact_id}`,
        });
      }
    }

    // Appointment booked by this caller shortly after the call started.
    const appt = appts.find(
      (a) =>
        a.digits &&
        a.digits === callerDigits &&
        new Date(a.created_at).getTime() >= callTime - 10 * 60 * 1000 &&
        new Date(a.created_at).getTime() <= callTime + 2 * 60 * 60 * 1000,
    );
    if (appt) {
      actions.push({
        kind: "appointment_set",
        label: "Appointment set",
        href: "/dashboard/calendar",
      });
    }

    const task = sid ? taskBySid.get(sid) : undefined;
    if (task) {
      actions.push({ kind: "task_created", label: "Task created", href: "/dashboard/tasks" });
    }

    if (c.textback_sent) {
      actions.push({ kind: "textback_sent", label: "Text-back sent" });
    }

    // Call-back ladder — only meaningful on the missed call that
    // started it (or its call-back attempts).
    const callback =
      callerDigits && (c.status === "missed" || (c.notes ?? "").startsWith("Automatic call-back"))
        ? (callbackByDigits.get(callerDigits) ?? null)
        : null;
    if (callback) {
      const label =
        callback.status === "scheduled"
          ? `Calling back (attempt ${callback.attempts + 1} of 3 ${callback.next_attempt_at ? `at ${new Date(callback.next_attempt_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "soon"})`
          : callback.status === "answered"
            ? "Reached by call-back"
            : callback.status === "exhausted"
              ? "Call-backs exhausted — needs you"
              : "Call-back cancelled";
      actions.push({ kind: "callback", label });
    }

    const reason =
      personal && c.direction === "inbound" && c.status === "missed"
        ? "Personal call"
        : deriveReason(c);
    return { ...c, reason, actions, callback };
  });
}

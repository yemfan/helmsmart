/**
 * "Saved" must mean a row changed.
 *
 * Through the RLS-enforced Supabase client an update or delete that a policy
 * forbids is NOT an error: it matches zero rows and comes back clean. Each
 * action below used to discard that result, so a settings card said "Saved!",
 * a switch stayed flipped, a card stayed in its new pipeline column, or a note
 * vanished from the screen — over a database that never changed.
 *
 * Every test here drives the one case a happy-path test cannot see: no error,
 * zero rows. The action must report it as a failure, in the owner's language,
 * and must not revalidate as though something were saved. The database error
 * case is asserted too, because the fix for it is the same rule the other way
 * round: log Postgres's sentence, never show it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

// The membership guard has its own tests (lib/auth/org-context.test.ts). Here
// the caller is a member of whatever org the cookie names.
vi.mock("@/lib/auth/org-context", () => ({
  getMemberOrgId: async () => cookieStore.get()?.value ?? null,
}));

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

// Dependencies of the modules under test that these actions never reach.
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/receptionist-agent", () => ({ loadReceptionistContext: vi.fn() }));
vi.mock("@/lib/outbound-queue", () => ({
  placeOutboundCall: vi.fn(),
  withinCallingHours: vi.fn(),
  resolveOutboundAgentId: vi.fn(),
  enqueueCalls: vi.fn(),
  drainOutboundQueue: vi.fn(),
}));
vi.mock("@/lib/integrations/slack", () => ({ notifySlack: vi.fn(), notifySlackNewLead: vi.fn() }));
vi.mock("@/lib/automation-engine", () => ({ runAutomations: vi.fn() }));
vi.mock("@/components/role-guard", () => ({ checkActionPermission: async () => null }));
// server-only; `createEvent` reads it to turn a wall clock into an instant.
vi.mock("@/lib/org-timezone", () => ({
  orgTimezone: async () => "America/Los_Angeles",
  orgToday: async () => "2026-09-12",
}));
vi.mock("@/lib/google-business", () => ({ replyToGoogleReview: vi.fn() }));
vi.mock("@/lib/google-calendar", () => ({
  syncEventToGoogle: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  isGoogleCalendarConnected: async () => false,
}));

// ─── A recording Supabase client ────────────────────────────────────────────

type Result = { data: unknown; error: { message: string } | null };

/** One `from(table)` chain: what it did, to what, filtered how. */
type Call = {
  client: "rls" | "service";
  table: string;
  op?: "update" | "delete" | "insert" | "upsert" | "select";
  payload?: unknown;
  filters: Array<[string, unknown]>;
  selected?: string;
};

const calls: Call[] = [];

/** What a write resolves to. Reassigned per test; reads always come back empty. */
let writeResult: Result;

function chain(client: Call["client"], table: string) {
  const call: Call = { client, table, filters: [] };
  calls.push(call);
  const b = {
    update(payload: unknown) { call.op = "update"; call.payload = payload; return b; },
    delete() { call.op = "delete"; return b; },
    insert(payload: unknown) { call.op = "insert"; call.payload = payload; return b; },
    upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return b; },
    select(cols?: string) {
      if (call.op) call.selected = cols;
      else call.op = "select";
      return b;
    },
    eq(col: string, val: unknown) { call.filters.push([col, val]); return b; },
    in(col: string, val: unknown) { call.filters.push([col, val]); return b; },
    single() { return b; },
    maybeSingle() { return b; },
    then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
      const r: Result = call.op === "select" ? { data: null, error: null } : writeResult;
      return Promise.resolve(r).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => chain("rls", table),
  }),
  createServiceClient: async () => ({
    from: (table: string) => chain("service", table),
  }),
}));

const { updateOrg } = await import("./org-update");
const { saveBusinessHours, deleteAppointmentType, deleteKnowledgeEntry } = await import("./receptionist");
const { saveReminderSettings } = await import("./outbound");
const { saveSlackNotifyToggle, saveSlackWebhook } = await import("./slack-settings");
const { updateClient, patchClient } = await import("./clients");
const { toggleAutomationRule, deleteAutomationRule } = await import("./automations");
const { updateTaskStatus, deleteTask } = await import("./tasks");
const { deleteClientNote } = await import("./client-notes");
const { createEvent, toggleEventComplete, deleteEvent } = await import("./events");
const { toggleAutoRequestReviews } = await import("./google-business");

const en = (ns: string) => translatorFor("en", ns);
const REFUSED = { data: [], error: null } satisfies Result;
const DB_ERROR = { data: null, error: { message: 'permission denied for table "x"' } } satisfies Result;

/** The write the action made — the last chain that was not a plain read. */
function lastWrite(): Call {
  const w = [...calls].reverse().find((c) => c.op && c.op !== "select");
  if (!w) throw new Error("the action made no write");
  return w;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  cookieStore.get.mockReturnValue({ value: "org-1" });
  writeResult = { data: [{ id: "row-1", client_id: null }], error: null };
});

// ─── The organization helper everything else routes through ────────────────

describe("updateOrg", () => {
  it("asks for the changed rows back", async () => {
    await updateOrg("org-1", { name: "x" }, "test");
    expect(lastWrite()).toMatchObject({ client: "rls", table: "organizations", selected: "id" });
  });

  it("reports zero rows as refused, not saved", async () => {
    writeResult = REFUSED;
    const res = await updateOrg("org-1", { name: "x" }, "test");
    expect(res).toEqual({ ok: false, error: en("settings")("errors.orgUpdateRefused") });
  });

  it("does not publish the database's own words", async () => {
    writeResult = DB_ERROR;
    const res = await updateOrg("org-1", { name: "x" }, "test");
    expect(res).toEqual({ ok: false, error: en("settings")("errors.orgUpdateFailed") });
  });
});

// ─── Receptionist settings (finding 1) ─────────────────────────────────────

describe("receptionist settings", () => {
  it("business hours: zero rows is a refusal, and nothing is revalidated", async () => {
    writeResult = REFUSED;
    const res = await saveBusinessHours({} as never);
    expect(res.error).toBe(en("settings")("errors.orgUpdateRefused"));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("business hours: a real save reports no error", async () => {
    const res = await saveBusinessHours({} as never);
    expect(res).toEqual({});
    expect(lastWrite()).toMatchObject({ table: "organizations", selected: "id" });
  });

  it("deleting an appointment type that matched no row keeps it and says why", async () => {
    writeResult = REFUSED;
    const res = await deleteAppointmentType("appt-1");
    expect(res.error).toBe(en("voice")("errors.apptTypeRefused"));
    expect(lastWrite()).toMatchObject({ op: "delete", table: "appointment_types", selected: "id" });
    expect(lastWrite().filters).toContainEqual(["organization_id", "org-1"]);
  });

  it("deleting a knowledge entry that matched no row keeps it and says why", async () => {
    writeResult = REFUSED;
    const res = await deleteKnowledgeEntry("kb-1");
    expect(res.error).toBe(en("voice")("errors.knowledgeRefused"));
    expect(lastWrite()).toMatchObject({ op: "delete", table: "knowledge_base", selected: "id" });
  });

  it("a delete that did remove a row reports success", async () => {
    expect(await deleteAppointmentType("appt-1")).toEqual({});
  });
});

// ─── Appointment reminders (finding 3) ─────────────────────────────────────

describe("saveReminderSettings", () => {
  it("writes through the RLS client, not the service client", async () => {
    await saveReminderSettings({ enabled: true });
    expect(lastWrite()).toMatchObject({ client: "rls", table: "organizations", selected: "id" });
  });

  it("the switch writes only the switch — never an unsaved lead time", async () => {
    await saveReminderSettings({ enabled: true });
    expect(lastWrite().payload).toEqual({ voice_reminder_enabled: true });
  });

  it("the lead time writes only the lead time, clamped", async () => {
    await saveReminderSettings({ leadMinutes: 5 });
    expect(lastWrite().payload).toEqual({ voice_reminder_lead_minutes: 15 });
  });

  it("zero rows is a refusal", async () => {
    writeResult = REFUSED;
    const res = await saveReminderSettings({ enabled: false });
    expect(res).toEqual({ ok: false, error: en("settings")("errors.orgUpdateRefused") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ─── Slack alerts (finding 4) ──────────────────────────────────────────────

describe("Slack settings", () => {
  it("an alert switch that changed no row reports failure, so the switch can go back", async () => {
    writeResult = REFUSED;
    const res = await saveSlackNotifyToggle("slack_notify_new_lead", true);
    expect(res).toEqual({ ok: false, error: en("settings")("errors.orgUpdateRefused") });
  });

  it("an alert switch writes its one column through the RLS client", async () => {
    const res = await saveSlackNotifyToggle("slack_notify_missed_call", false);
    expect(res).toEqual({ ok: true });
    expect(lastWrite()).toMatchObject({
      client: "rls",
      payload: { slack_notify_missed_call: false },
      selected: "id",
    });
  });

  it("the webhook URL is held to the same rule", async () => {
    writeResult = REFUSED;
    const res = await saveSlackWebhook("https://hooks.slack.com/services/T/B/x");
    expect(res.ok).toBe(false);
  });
});

// ─── Clients and the pipeline (finding 5) ──────────────────────────────────

function clientForm(): FormData {
  const f = new FormData();
  f.set("client_id", "client-1");
  f.set("first_name", "Ana");
  return f;
}

describe("updateClient", () => {
  it("is scoped to the current organization", async () => {
    await updateClient(null, clientForm());
    const w = lastWrite();
    expect(w).toMatchObject({ table: "clients", op: "update", selected: "id" });
    expect(w.filters).toContainEqual(["id", "client-1"]);
    expect(w.filters).toContainEqual(["organization_id", "org-1"]);
  });

  it("zero rows is a refusal, not success", async () => {
    writeResult = REFUSED;
    const res = await updateClient(null, clientForm());
    expect(res).toEqual({ error: en("clients")("errors.updateRefused") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("patchClient", () => {
  it("returns ok when the row changed", async () => {
    expect(await patchClient("client-1", { pipeline_stage: "won" })).toEqual({ ok: true });
    expect(lastWrite().filters).toContainEqual(["organization_id", "org-1"]);
  });

  it("zero rows tells the board to put the card back", async () => {
    writeResult = REFUSED;
    const res = await patchClient("client-1", { pipeline_stage: "won" });
    expect(res).toEqual({ ok: false, error: en("clients")("errors.updateRefused") });
  });

  it("a database error is reported, in the owner's words", async () => {
    writeResult = DB_ERROR;
    const res = await patchClient("client-1", { expected_value: 5 });
    expect(res).toEqual({ ok: false, error: en("clients")("errors.updateFailed") });
  });
});

// ─── Automations (finding 6) ───────────────────────────────────────────────

describe("automations", () => {
  it("a toggle that changed no row reports failure", async () => {
    writeResult = REFUSED;
    const res = await toggleAutomationRule("rule-1", false);
    expect(res).toEqual({ ok: false, error: en("workflows")("automations.errors.refused") });
  });

  it("a toggle's database error is not shown raw", async () => {
    writeResult = DB_ERROR;
    const res = await toggleAutomationRule("rule-1", true);
    expect(res).toEqual({ ok: false, error: en("workflows")("automations.errors.toggleFailed") });
  });

  it("a delete that removed nothing reports failure", async () => {
    writeResult = REFUSED;
    const res = await deleteAutomationRule("rule-1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe(en("workflows")("automations.errors.refused"));
  });

  it("a real toggle reports ok", async () => {
    expect(await toggleAutomationRule("rule-1", true)).toEqual({ ok: true });
  });
});

// ─── Tasks (finding 7) ─────────────────────────────────────────────────────

describe("tasks", () => {
  it("marking a task done that matched no row reports failure", async () => {
    writeResult = REFUSED;
    const res = await updateTaskStatus("task-1", "done");
    expect(res).toEqual({ ok: false, error: en("tasks")("errors.taskRefused") });
  });

  it("deleting a task that matched no row reports failure", async () => {
    writeResult = REFUSED;
    const res = await deleteTask("task-1");
    expect(res).toEqual({ ok: false, error: en("tasks")("errors.taskRefused") });
  });

  it("a real status change reports ok and revalidates", async () => {
    expect(await updateTaskStatus("task-1", "open")).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });
});

// ─── Client notes (finding 8) ──────────────────────────────────────────────

describe("deleteClientNote", () => {
  it("zero rows means the note is still there", async () => {
    writeResult = REFUSED;
    const res = await deleteClientNote("note-1", "client-1");
    expect(res).toEqual({ ok: false, error: en("clients")("notes.errors.deleteRefused") });
    expect(lastWrite()).toMatchObject({ table: "client_notes", op: "delete", selected: "id" });
  });

  it("a database error is reported, not swallowed", async () => {
    writeResult = DB_ERROR;
    const res = await deleteClientNote("note-1", "client-1");
    expect(res).toEqual({ ok: false, error: en("clients")("notes.errors.deleteFailed") });
  });
});

// ─── Google Business auto-request (sweep) ──────────────────────────────────

describe("toggleAutoRequestReviews", () => {
  it("zero rows is a refusal, so the switch goes back", async () => {
    writeResult = REFUSED;
    const res = await toggleAutoRequestReviews(true);
    expect(res).toEqual({ ok: false, error: en("settings")("errors.orgUpdateRefused") });
  });

  it("a database error is not shown raw", async () => {
    writeResult = DB_ERROR;
    const res = await toggleAutoRequestReviews(false);
    expect(res.error).not.toContain("permission denied");
  });
});

// ─── Calendar events (finding 6, events) ───────────────────────────────────

describe("events", () => {
  it("completing an event that matched no row reports failure", async () => {
    writeResult = REFUSED;
    const res = await toggleEventComplete("ev-1", true);
    expect(res).toEqual({ ok: false, error: en("tasks")("errors.eventRefused") });
  });

  it("deleting an event that matched no row reports failure", async () => {
    writeResult = REFUSED;
    const res = await deleteEvent("ev-1");
    expect(res).toEqual({ ok: false, error: en("tasks")("errors.eventRefused") });
  });

  it("a failed create throws the owner's copy, not Postgres's", async () => {
    writeResult = DB_ERROR;
    await expect(
      createEvent({ title: "x", type: "meeting", color: "indigo", date: "2026-09-10", time: "09:00", allDay: false }),
    ).rejects.toThrow(en("tasks")("errors.eventCreateFailed"));
  });
});

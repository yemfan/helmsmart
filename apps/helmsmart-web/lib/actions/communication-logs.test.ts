/**
 * These actions map a camelCase/snake_case object onto database columns by hand,
 * and every field used to be optional — so when `updateClientPreferences`
 * destructured `preferences.optedOutSms` off an object the panel had filled with
 * `opted_out_sms`, nothing errored. The upsert wrote `undefined` for every
 * column, the action returned ok, and the panel reported a save that never
 * happened. On consent flags for outbound SMS, email and calls.
 *
 * The tests below assert the one thing a type can't: that each field the caller
 * supplies actually reaches the database payload, under the column name the
 * table uses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

/* `getServerT` is backed by the real bundles, so the refusal message asserted
 * below is the Chinese a user would actually read — not a mock echoing a key. */
let locale: "en" | "zh-Hans" = "zh-Hans";
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

/** Records what was handed to the database, and replays a canned result. */
type Recorder = {
  table?: string;
  payload?: Record<string, unknown>;
  options?: unknown;
  selected?: string;
};

const rls: Recorder = {};
const service: Recorder = {};

/** What `.select()` resolves to on the RLS client. Reassigned per test. */
let rlsResult: { data: unknown[] | null; error: { message: string } | null } = {
  data: [{ id: "pref-1" }],
  error: null,
};

/** What the service-client insert resolves to. */
let serviceResult: { data: unknown; error: { message: string } | null } = {
  data: { id: "log-1" },
  error: null,
};

/**
 * Any other table the action reads after a save (the client's phone and email,
 * to clear an unsubscribe when a switch goes off) answers "no row" — these
 * tests are about the preferences payload, and the clearing has its own tests
 * in `communication-logs.consent.test.ts`.
 */
function noRows() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "maybeSingle", "single", "update", "delete"]) {
    chain[m] = () => chain;
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      if (table !== "communication_preferences") return noRows();
      rls.table = table;
      return {
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          rls.payload = payload;
          rls.options = options;
          return {
            select: (cols: string) => {
              rls.selected = cols;
              return Promise.resolve(rlsResult);
            },
          };
        },
      };
    },
  }),
  createServiceClient: async () => ({
    from: (table: string) => {
      service.table = table;
      return {
        insert: (payload: Record<string, unknown>) => {
          service.payload = payload;
          return {
            select: (cols: string) => {
              service.selected = cols;
              return { single: () => Promise.resolve(serviceResult) };
            },
          };
        },
      };
    },
  }),
}));

const { updateClientPreferences, logCommunication } = await import(
  "./communication-logs"
);

const ALL_PREFERENCES = {
  opted_out_sms: true,
  opted_out_email: false,
  opted_out_calls: true,
  preferred_contact_method: "email",
  best_time_to_contact: "evening",
  notes: "prefers email after 5pm",
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "org-1" });
  rlsResult = { data: [{ id: "pref-1" }], error: null };
  serviceResult = { data: { id: "log-1" }, error: null };
  for (const r of [rls, service]) {
    r.table = undefined;
    r.payload = undefined;
    r.options = undefined;
    r.selected = undefined;
  }
});

describe("updateClientPreferences", () => {
  it("forwards every preference to its own database column", async () => {
    const result = await updateClientPreferences("client-1", ALL_PREFERENCES);

    expect(result).toEqual({ ok: true });
    expect(rls.table).toBe("communication_preferences");
    expect(rls.payload).toMatchObject({
      organization_id: "org-1",
      client_id: "client-1",
      opted_out_sms: true,
      opted_out_email: false,
      opted_out_calls: true,
      preferred_contact_method: "email",
      best_time_to_contact: "evening",
      notes: "prefers email after 5pm",
    });
    expect(rls.options).toEqual({ onConflict: "organization_id,client_id" });
  });

  it("writes no undefined column — the shape of the silent-loss bug", async () => {
    await updateClientPreferences("client-1", ALL_PREFERENCES);

    const undefinedColumns = Object.entries(rls.payload ?? {})
      .filter(([, v]) => v === undefined)
      .map(([k]) => k);
    expect(undefinedColumns).toEqual([]);
  });

  it("distinguishes each opt-out flag rather than collapsing them", async () => {
    // A mapping that read the same source field three times would pass a
    // single-flag test; this one pins each flag to its own column.
    await updateClientPreferences("client-1", {
      ...ALL_PREFERENCES,
      opted_out_sms: true,
      opted_out_email: false,
      opted_out_calls: false,
    });

    expect(rls.payload?.opted_out_sms).toBe(true);
    expect(rls.payload?.opted_out_email).toBe(false);
    expect(rls.payload?.opted_out_calls).toBe(false);
  });

  it("asks for the rows back so a refusal cannot look like a save", async () => {
    await updateClientPreferences("client-1", ALL_PREFERENCES);
    expect(rls.selected).toBe("id");
  });

  it("reports an RLS refusal — no error, zero rows — as a failure", async () => {
    rlsResult = { data: [], error: null };

    const result = await updateClientPreferences("client-1", ALL_PREFERENCES);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(translatorFor("zh-Hans", "clients")("errors.preferencesRefused"));
    // A refusal is a permission problem, not a retry problem — it must not be
    // the generic "try again" copy, and it must not be English.
    expect(result.error).not.toBe(translatorFor("zh-Hans", "clients")("errors.preferencesFailed"));
    expect(result.error).toMatch(/[一-鿿]/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a database error without publishing the database's words", async () => {
    // Postgres sentences are not for the owner, and on a zh-Hans page they are
    // not even in their language. Same rule as `authErrorMessage`.
    rlsResult = { data: null, error: { message: 'relation "x" does not exist' } };

    const result = await updateClientPreferences("client-1", ALL_PREFERENCES);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(translatorFor("zh-Hans", "clients")("errors.preferencesFailed"));
    expect(result.error).not.toContain("relation");
  });

  it("refuses to write without an organization", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const result = await updateClientPreferences("client-1", ALL_PREFERENCES);

    expect(result.ok).toBe(false);
    expect(rls.payload).toBeUndefined();
  });

  it("revalidates the client page after a real save", async () => {
    await updateClientPreferences("client-1", ALL_PREFERENCES);
    expect(revalidatePath).toHaveBeenCalledWith("/clients/client-1");
  });
});

describe("logCommunication", () => {
  it("forwards every input field to its own database column", async () => {
    const result = await logCommunication({
      clientId: "client-1",
      type: "call",
      direction: "outbound",
      status: "completed",
      body: "spoke about the quote",
      subject: "Follow-up",
      durationSeconds: 245,
      fromPhoneNumber: "+15550001111",
      fromEmail: "tech@example.com",
      toPhoneNumber: "+15552223333",
      toEmail: "client@example.com",
      twilioCallSid: "CA123",
      twilioMessageSid: "SM123",
      emailMessageId: "msg-1",
      appointmentId: "appt-1",
      fromAiEmployeeId: "emp-1",
      sentiment: "positive",
      aiSummary: "Client approved the estimate.",
    });

    expect(result).toEqual({ ok: true, logId: "log-1" });
    expect(service.table).toBe("communication_logs");
    expect(service.payload).toEqual({
      organization_id: "org-1",
      client_id: "client-1",
      type: "call",
      direction: "outbound",
      status: "completed",
      body: "spoke about the quote",
      subject: "Follow-up",
      duration_seconds: 245,
      from_phone_number: "+15550001111",
      from_email: "tech@example.com",
      to_phone_number: "+15552223333",
      to_email: "client@example.com",
      twilio_call_sid: "CA123",
      twilio_message_sid: "SM123",
      email_message_id: "msg-1",
      appointment_id: "appt-1",
      from_user_id: "user-1",
      from_ai_employee_id: "emp-1",
      sentiment: "positive",
      ai_summary: "Client approved the estimate.",
    });
  });
});

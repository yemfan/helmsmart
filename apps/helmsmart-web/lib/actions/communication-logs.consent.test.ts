/**
 * Switching an opt-out OFF on the client page has to clear every source that
 * made it read ON — otherwise the switch says "off" over sends that are still
 * refused, the lie CLAUDE.md forbids. Switching it ON, or saving anything
 * else, must leave a STOP where it is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translatorFor } from "@/lib/i18n/translator";
import { fakeSupabase, type FakeDb } from "../__tests__/fake-supabase";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor("en", ns),
  getServerLocale: async () => "en",
}));

let f: FakeDb;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => f.db,
  createServiceClient: async () => f.db,
}));

const { updateClientPreferences } = await import("./communication-logs");

const ORG = "org-1";
const PREFS = {
  opted_out_sms: true,
  opted_out_email: true,
  opted_out_calls: false,
  preferred_contact_method: "any",
  best_time_to_contact: "",
  notes: "",
};

beforeEach(() => {
  cookieStore.get.mockReturnValue({ value: ORG });
  f = fakeSupabase({
    clients: [{ id: "c1", organization_id: ORG, phone: "(626) 555-0101", email: "priya@example.com" }],
    communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true, opted_out_email: true }],
    sms_unsubscribes: [{ organization_id: ORG, phone_number: "+16265550101", unsubscribed_at: "2026-09-03T00:00:00Z", reason: "stop_keyword" }],
    email_unsubscribes: [{ organization_id: ORG, email: "priya@example.com", unsubscribed_at: "2026-09-03T00:00:00Z" }],
  });
});

describe("updateClientPreferences and the unsubscribe tables", () => {
  it("switching texts off clears the STOP record too", async () => {
    expect(await updateClientPreferences("c1", { ...PREFS, opted_out_sms: false })).toEqual({ ok: true });
    expect(f.rows("sms_unsubscribes")).toEqual([]);
    expect(f.rows("email_unsubscribes")).toHaveLength(1);
  });

  it("switching email off clears the email unsubscribe", async () => {
    await updateClientPreferences("c1", { ...PREFS, opted_out_email: false });
    expect(f.rows("email_unsubscribes")).toEqual([]);
    expect(f.rows("sms_unsubscribes")).toHaveLength(1);
  });

  it("saving with the switches on leaves both records alone", async () => {
    await updateClientPreferences("c1", { ...PREFS, notes: "prefers mornings" });
    expect(f.rows("sms_unsubscribes")).toHaveLength(1);
    expect(f.rows("email_unsubscribes")).toHaveLength(1);
  });
});

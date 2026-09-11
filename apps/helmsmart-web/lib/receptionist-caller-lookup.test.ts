/**
 * lookup_appointment recognises the caller however the owner typed their
 * number in. It used to match `phone ilike '%4155550143'`, which finds
 * "+14155550143" and misses "(415) 555-0143" — and a caller who was missed was
 * told they had no appointment.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_UPCOMING_APPOINTMENT_TEXT } from "@repo/voice/tools";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/i18n/userLocale", () => ({ orgWriteLocale: async () => null, userUiLocales: async () => new Map() }));
vi.mock("@/lib/notifications-service", () => ({ createNotificationService: vi.fn() }));
vi.mock("@/lib/booking", () => ({ matchOrCreateClient: vi.fn(), getAvailability: vi.fn(), bookAppointment: vi.fn() }));
vi.mock("@/lib/workforce-attribution", () => ({ recordEmmaBooking: vi.fn() }));
vi.mock("@/lib/org-recipients", () => ({ orgOwnerRecipients: async () => [] }));

const { runReceptionistTool } = await import("./receptionist-agent");

const ORG = "org-1";
const CALLER_ID = "+14155550143";
let f: FakeDb;

function seed(clientPhone: string, over: { clientOrg?: string } = {}) {
  f = fakeSupabase({
    organizations: [{ id: ORG, timezone: "America/Los_Angeles" }],
    clients: [{ id: "c1", organization_id: over.clientOrg ?? ORG, first_name: "Priya", phone: clientPhone }],
    events: [
      {
        id: "e1",
        organization_id: ORG,
        type: "appointment",
        client_id: "c1",
        title: "Cleaning",
        start_at: "2099-03-04T21:00:00.000Z",
      },
    ],
  });
}

const lookup = (fromNumber = CALLER_ID) =>
  runReceptionistTool("lookup_appointment", {}, { db: f.db, orgId: ORG, fromNumber });

beforeEach(() => vi.clearAllMocks());

describe("lookup_appointment", () => {
  it.each([
    "+14155550143",
    "(415) 555-0143",
    "415-555-0143",
    "415.555.0143",
    "415 555 0143",
    "4155550143",
    "14155550143",
    "+1 (415) 555-0143",
    "+1 415 555 0143",
  ])("finds the appointment of a client stored as %s", async (stored) => {
    seed(stored);
    const { text } = await lookup();
    expect(text).not.toBe(NO_UPCOMING_APPOINTMENT_TEXT);
    expect(text).toContain("(Cleaning)");
  });

  it("finds it when the caller ID arrives without the +1", async () => {
    seed("(415) 555-0143");
    expect((await lookup("4155550143")).text).toContain("(Cleaning)");
  });

  it("does not hand one caller another person's appointment", async () => {
    seed("(415) 777-0143");
    expect((await lookup()).text).toBe(NO_UPCOMING_APPOINTMENT_TEXT);
  });

  it("does not look in another business's clients", async () => {
    seed("(415) 555-0143", { clientOrg: "org-2" });
    expect((await lookup()).text).toBe(NO_UPCOMING_APPOINTMENT_TEXT);
  });

  it("matches nobody on a withheld caller ID", async () => {
    seed("anonymous");
    expect((await lookup("anonymous")).text).toBe(NO_UPCOMING_APPOINTMENT_TEXT);
  });
});

/**
 * The AI receptionist's booking confirmation text goes through the consent
 * guard; its alert to the business's own phone does not — that is a message to
 * the owner, not to a client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
});

vi.mock("server-only", () => ({}));
const twilioCreate = vi.hoisted(() => vi.fn());
vi.mock("twilio", () => ({ default: () => ({ messages: { create: twilioCreate } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/i18n/userLocale", () => ({ orgWriteLocale: async () => null, userUiLocales: async () => new Map() }));
vi.mock("@/lib/notifications-service", () => ({ createNotificationService: vi.fn() }));
vi.mock("@/lib/booking", () => ({ matchOrCreateClient: async () => "c1", getAvailability: vi.fn(), bookAppointment: vi.fn() }));
vi.mock("@/lib/workforce-attribution", () => ({ recordEmmaBooking: vi.fn() }));
vi.mock("@/lib/org-recipients", () => ({ orgOwnerRecipients: async () => [] }));

const { notifyBooking } = await import("./receptionist-agent");

const ORG = "org-1";
let f: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  twilioCreate.mockResolvedValue({ sid: "SM1", from: "+15550000000" });
  f = fakeSupabase({
    organizations: [{ id: ORG, booking_alert_phone: "+16265550199" }],
    clients: [{ id: "c1", organization_id: ORG, first_name: "Priya", last_name: "Patel", phone: "+16265550101" }],
  });
});

const book = () =>
  notifyBooking(f.db, { orgId: ORG, orgName: "Acme", twilioNumber: "+15550000000" }, "+16265550101", {
    bookedNote: "Cleaning on Tue at 2pm",
    bookedLabel: "Tue Sep 15 at 2:00 PM",
    rescheduleToken: null,
  });

describe("notifyBooking", () => {
  it("does not text the confirmation to a caller who opted out, but still alerts the business", async () => {
    f.rows("communication_preferences").push({ organization_id: ORG, client_id: "c1", opted_out_sms: true });
    await book();
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+16265550199" }));
    expect(f.rows("messages")).toEqual([
      expect.objectContaining({ client_id: null, to_address: "+16265550199", sent_by: "receptionist" }),
    ]);
  });

  it("(control) texts both when nobody opted out, each labelled as the receptionist's", async () => {
    await book();
    expect(twilioCreate).toHaveBeenCalledTimes(2);
    expect(f.rows("messages").map((m) => [m.client_id, m.sent_by])).toEqual([
      ["c1", "receptionist"],
      [null, "receptionist"],
    ]);
  });
});

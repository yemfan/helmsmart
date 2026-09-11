/**
 * matchOrCreateClient runs on every inbound call and every receptionist
 * booking. With an exact `eq("phone", …)` a client the owner typed in as
 * "(415) 555-0143" was never found for caller ID "+14155550143": their first
 * call created a "Caller" lead beside them, and every later call and booking
 * attached to that lead instead of the client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.mock("server-only", () => ({}));
const serviceClient = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => serviceClient.db }));
vi.mock("@/lib/google-calendar", () => ({
  getGoogleFreeBusy: vi.fn(),
  upsertGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}));

const { matchOrCreateClient } = await import("./booking");

const ORG = "org-1";
let f: FakeDb;

function seed(clients: Record<string, unknown>[]) {
  f = fakeSupabase({ clients });
  serviceClient.db = f.db;
}

beforeEach(() => vi.clearAllMocks());

describe("matchOrCreateClient", () => {
  it("finds a client typed in by hand for an E.164 caller ID, and creates nothing", async () => {
    seed([{ id: "c1", organization_id: ORG, phone: "(415) 555-0143", created_at: "2026-01-01T00:00:00Z" }]);
    expect(await matchOrCreateClient(ORG, "+14155550143")).toBe("c1");
    expect(f.writes).toEqual([]);
  });

  it("prefers the oldest match — the client someone entered, not a lead a call made", async () => {
    seed([
      { id: "lead", organization_id: ORG, phone: "+14155550143", created_at: "2026-09-01T00:00:00Z" },
      { id: "real", organization_id: ORG, phone: "415-555-0143", created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(await matchOrCreateClient(ORG, "+14155550143")).toBe("real");
    expect(f.writes).toEqual([]);
  });

  it("creates a lead for a number no client has", async () => {
    seed([{ id: "c1", organization_id: ORG, phone: "(415) 777-0143", created_at: "2026-01-01T00:00:00Z" }]);
    const id = await matchOrCreateClient(ORG, "+14155550143", "Sam Lee");
    expect(id).not.toBe("c1");
    expect(f.rows("clients").find((c) => c.id === id)).toMatchObject({
      organization_id: ORG,
      phone: "+14155550143",
      source: "voice",
    });
  });

  it("does not match the same number in another business", async () => {
    seed([{ id: "other", organization_id: "org-2", phone: "(415) 555-0143", created_at: "2026-01-01T00:00:00Z" }]);
    expect(await matchOrCreateClient(ORG, "+14155550143")).not.toBe("other");
  });
});

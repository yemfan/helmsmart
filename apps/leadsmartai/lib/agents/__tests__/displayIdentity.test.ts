import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePostgrest, type FakeTable } from "@/lib/testing/fakePostgrest";

vi.mock("server-only", () => ({}));

const tables: Record<string, FakeTable> = {};
const fake = createFakePostgrest(tables);
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: fake.supabaseAdmin }));

const { loadAgentDisplayIdentities, loadAgentDisplayIdentity, splitFullName } = await import(
  "../displayIdentity.server"
);

beforeEach(() => {
  fake.selects.length = 0;
  tables.agents = {
    columns: ["id", "auth_user_id", "brand_name", "brokerage", "phone"],
    rows: [
      { id: 26, auth_user_id: "u26", brand_name: "Michael Ye Real Estate", brokerage: "eXp", phone: null },
      { id: 30, auth_user_id: "u30", brand_name: null, brokerage: "Testers", phone: "310-555-0100" },
      { id: 31, auth_user_id: null, brand_name: null, brokerage: null, phone: null },
    ],
  };
  tables.user_profiles = {
    columns: ["user_id", "full_name", "email", "phone"],
    rows: [
      { user_id: "u26", full_name: "Michael Yestest", email: "m@example.com", phone: "626-555-0100" },
      { user_id: "u30", full_name: "Tom", email: null, phone: null },
    ],
  };
});

describe("splitFullName", () => {
  it("splits on the first space and keeps the rest as last name", () => {
    expect(splitFullName("Jane Q. Doe")).toEqual({ firstName: "Jane", lastName: "Q. Doe" });
    expect(splitFullName("  Tom ")).toEqual({ firstName: "Tom", lastName: null });
    expect(splitFullName("")).toEqual({ firstName: null, lastName: null });
    expect(splitFullName(null)).toEqual({ firstName: null, lastName: null });
  });
});

describe("loadAgentDisplayIdentities", () => {
  it("never asks a table for a column it does not have", async () => {
    await loadAgentDisplayIdentities([26, 30, 31]);
    expect(fake.unknownColumns()).toEqual([]);
  });

  it("reads names from user_profiles and brokerage from agents, in two queries", async () => {
    const map = await loadAgentDisplayIdentities(["26", 30]);
    expect(fake.selects.map((s) => s.table)).toEqual(["agents", "user_profiles"]);
    expect(map.get("26")).toEqual({
      agentId: "26",
      authUserId: "u26",
      firstName: "Michael",
      lastName: "Yestest",
      fullName: "Michael Yestest",
      brokerage: "Michael Ye Real Estate",
      email: "m@example.com",
      phone: "626-555-0100",
      profilePhone: "626-555-0100",
    });
    expect(map.get("30")).toMatchObject({ firstName: "Tom", lastName: null, brokerage: "Testers", phone: "310-555-0100", profilePhone: null, email: null });
  });

  it("returns an entry with blanks for an agent with no auth user, and nothing for an unknown id", async () => {
    const map = await loadAgentDisplayIdentities([31, 999]);
    expect(map.get("31")).toMatchObject({ authUserId: null, firstName: null, fullName: null });
    expect(map.has("999")).toBe(false);
  });

  it("skips the profile query when nothing is asked for", async () => {
    expect((await loadAgentDisplayIdentities([])).size).toBe(0);
    expect(fake.selects).toEqual([]);
  });

  it("throws, rather than returning nobody, when a column does not exist", async () => {
    tables.agents.columns = ["id", "auth_user_id"];
    await expect(loadAgentDisplayIdentities([26])).rejects.toThrow(/42703/);
  });
});

describe("loadAgentDisplayIdentity", () => {
  it("returns one agent or null", async () => {
    expect((await loadAgentDisplayIdentity(30))?.firstName).toBe("Tom");
    expect(await loadAgentDisplayIdentity("nope")).toBeNull();
  });
});

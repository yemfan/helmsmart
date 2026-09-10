import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * A stand-in for PostgREST: every table declares the columns it really has,
 * and selecting one it does not have answers `{ data: null, error: 42703 }`
 * without throwing — exactly the shape that let the old
 * `select("first_name, last_name, brokerage_name, …, license_number")` on
 * `agents` fall through to a blank identity in production.
 */
type Table = { columns: string[]; rows: Record<string, unknown>[] };
const tables: Record<string, Table> = {};
const selects: Array<{ table: string; columns: string }> = [];

function query(table: string, columns: string) {
  selects.push({ table, columns });
  const t = tables[table];
  const asked = columns.split(",").map((c) => c.trim()).filter(Boolean);
  const missing = !t ? asked : asked.filter((c) => !t.columns.includes(c));
  const filters: Array<[string, unknown]> = [];
  const run = () => {
    if (missing.length) {
      return {
        data: null,
        error: { code: "42703", message: `column ${table}.${missing[0]} does not exist` },
      };
    }
    const rows = t.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const pick = (r: Record<string, unknown>) =>
      Object.fromEntries(asked.map((c) => [c, r[c] ?? null]));
    return { data: rows.length ? pick(rows[0]) : null, error: null };
  };
  const builder = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: () => Promise.resolve(run()),
    single: () => Promise.resolve(run()),
  };
  return builder;
}

const getUserById = vi.fn(async (id: string) => ({
  data: { user: { id, email: `${id}@auth.example` } },
  error: null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({ select: (columns: string) => query(table, columns) }),
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  },
}));

const loadAgentLicense = vi.fn(async (_agentId: string) => null as null | { number: string; state: string });
vi.mock("@/lib/teams/license.server", () => ({
  loadAgentLicense: (id: string) => loadAgentLicense(id),
}));

const { loadAgentIdentity } = await import("../loadAgentIdentity");

const AGENT = "agent-1";
const UID = "auth-user-1";

beforeEach(() => {
  selects.length = 0;
  loadAgentLicense.mockReset();
  loadAgentLicense.mockResolvedValue(null);
  getUserById.mockClear();

  // The columns these tables actually carry. `agents` has no first_name /
  // last_name / brokerage_name / license_number.
  tables.agents = {
    columns: ["id", "auth_user_id", "brand_name", "brokerage", "phone", "signature_html", "logo_url", "agent_photo_url", "service_areas_v2"],
    rows: [{ id: AGENT, auth_user_id: UID, brand_name: null, brokerage: "Sunset Realty", phone: "310-555-0100" }],
  };
  tables.user_profiles = {
    columns: ["user_id", "full_name", "email", "phone", "avatar_url"],
    rows: [{ user_id: UID, full_name: "Jane Doe", email: "jane@sunset.example", phone: "310-555-0199" }],
  };
  tables.leadsmart_users = {
    columns: ["user_id", "license_number", "brokerage"],
    rows: [{ user_id: UID, license_number: "01234567", brokerage: "Sunset Realty Inc." }],
  };
});

describe("loadAgentIdentity", () => {
  it("only asks tables for columns they have", async () => {
    await loadAgentIdentity(AGENT);
    const unknown = selects.flatMap(({ table, columns }) =>
      columns
        .split(",")
        .map((c) => c.trim())
        .filter((c) => !tables[table]?.columns.includes(c))
        .map((c) => `${table}.${c}`),
    );
    expect(unknown).toEqual([]);
  });

  it("reads the name from user_profiles and the license from agent_licenses", async () => {
    loadAgentLicense.mockResolvedValue({ number: "02001122", state: "CA" });
    const identity = await loadAgentIdentity(AGENT);
    expect(identity).toEqual({
      name: "Jane Doe",
      brokerage: "Sunset Realty",
      phone: "310-555-0100",
      email: "jane@sunset.example",
      licenseNumber: "02001122",
    });
  });

  it("falls back to leadsmart_users.license_number when no agent_licenses row exists", async () => {
    const identity = await loadAgentIdentity(AGENT);
    expect(identity.licenseNumber).toBe("01234567");
    expect(identity.name).toBe("Jane Doe");
  });

  it("prefers the brand name, then agents.brokerage, then leadsmart_users.brokerage", async () => {
    tables.agents.rows[0].brand_name = "Jane Doe Homes";
    expect((await loadAgentIdentity(AGENT)).brokerage).toBe("Jane Doe Homes");

    tables.agents.rows[0].brand_name = null;
    tables.agents.rows[0].brokerage = null;
    expect((await loadAgentIdentity(AGENT)).brokerage).toBe("Sunset Realty Inc.");
  });

  it("falls back to the auth user's email when the profile has none", async () => {
    tables.user_profiles.rows[0].email = null;
    const identity = await loadAgentIdentity(AGENT);
    expect(identity.email).toBe(`${UID}@auth.example`);
    expect(getUserById).toHaveBeenCalledWith(UID);
  });

  it("returns a blank identity for an unknown agent", async () => {
    const identity = await loadAgentIdentity("nobody");
    expect(identity).toEqual({ name: null, brokerage: null, phone: null, email: null, licenseNumber: null });
  });

  it("would have caught the old select: unknown columns answer 42703 and lose the name", async () => {
    // Sanity check on the fake itself, so the first test above is load-bearing.
    const { data, error } = await query(
      "agents",
      "first_name, last_name, brokerage_name, auth_user_id, license_number",
    ).eq("id", AGENT).maybeSingle();
    expect(data).toBeNull();
    expect(error?.code).toBe("42703");
  });
});

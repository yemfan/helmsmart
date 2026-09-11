/**
 * The membership guard, and the actions the access-control bug was found in.
 *
 * The active org is a cookie the browser sends, so it is a claim, not a fact.
 * These tests pin the three answers the guard can give — not signed in, not a
 * member, member — and then drive the actions from the bug report with a
 * signed-in user whose cookie names someone else's org: each must refuse
 * without ever creating the service-role client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

let locale: "en" | "zh-Hans" | "es" = "en";
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
// server-only, and its read of `organizations` is not what these tests pin.
vi.mock("@/lib/org-timezone", () => ({ orgToday: async () => "2026-09-11" }));

// ─── A Supabase double ──────────────────────────────────────────────────────

let user: { id: string } | null;
let getUserThrows = false;
/** The caller's `organization_members` row per org id; absent = not a member. */
let memberships: Record<string, string>;
let membershipError: { message: string } | null;
/** Filters of each membership lookup, to prove it asked about (org, user). */
const lookups: Array<Record<string, unknown>> = [];

type Result = { data: unknown; error: { message: string } | null };
const serviceCalls: Array<{ table: string; op?: string; filters: Array<[string, unknown]> }> = [];
let serviceClientsCreated = 0;

function serviceChain(table: string) {
  const call: (typeof serviceCalls)[number] = { table, filters: [] };
  serviceCalls.push(call);
  const b = {
    insert() { call.op = "insert"; return b; },
    update() { call.op = "update"; return b; },
    delete() { call.op = "delete"; return b; },
    select() { call.op ??= "select"; return b; },
    eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    in(c: string, v: unknown) { call.filters.push([c, v]); return b; },
    order() { return b; },
    limit() { return b; },
    single() { return b; },
    maybeSingle() { return b; },
    then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
      const r: Result = call.op === "insert" ? { data: { id: "tpl-1" }, error: null } : { data: [], error: null };
      return Promise.resolve(r).then(resolve, reject);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        if (getUserThrows) throw new Error("auth down");
        return { data: { user } };
      },
    },
    from: (table: string) => {
      if (table !== "organization_members") throw new Error(`unexpected RLS read of ${table}`);
      const filters: Record<string, unknown> = {};
      lookups.push(filters);
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters[c] = v; return b; },
        maybeSingle: async () => {
          if (membershipError) return { data: null, error: membershipError };
          const role = filters.user_id === user?.id ? memberships[filters.organization_id as string] : undefined;
          return { data: role ? { role } : null, error: null };
        },
      };
      return b;
    },
  }),
  createServiceClient: async () => {
    serviceClientsCreated++;
    return { from: (table: string) => serviceChain(table) };
  },
}));

const { requireOrgMember, requireMemberOf, getMemberOrgId, ORG_COOKIE, LEGACY_ORG_COOKIE } = await import("./org-context");
const { getMyRole } = await import("@/lib/rbac");

const common = (l: "en" | "zh-Hans" | "es") => translatorFor(l, "common");

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  locale = "en";
  user = { id: USER };
  getUserThrows = false;
  memberships = { [ORG]: "bookkeeper" };
  membershipError = null;
  lookups.length = 0;
  serviceCalls.length = 0;
  serviceClientsCreated = 0;
});

// ─── The guard ──────────────────────────────────────────────────────────────

describe("requireOrgMember", () => {
  it("refuses when no org is selected, without asking the database", async () => {
    const res = await requireOrgMember();
    expect(res).toEqual({ ok: false, reason: "no-org", error: common("en")("orgAccess.noOrg") });
    expect(lookups).toHaveLength(0);
  });

  it("refuses a caller who is not signed in", async () => {
    jar.set(ORG_COOKIE, ORG);
    user = null;
    const res = await requireOrgMember();
    expect(res).toEqual({ ok: false, reason: "not-signed-in", error: common("en")("orgAccess.notSignedIn") });
    expect(lookups).toHaveLength(0);
  });

  it("refuses a signed-in user whose cookie names an org they do not belong to", async () => {
    jar.set(ORG_COOKIE, OTHER_ORG);
    const res = await requireOrgMember();
    expect(res).toEqual({ ok: false, reason: "not-member", error: common("en")("orgAccess.notMember") });
    // It asked about exactly this org and this user — not "any membership".
    expect(lookups).toEqual([{ organization_id: OTHER_ORG, user_id: USER }]);
  });

  it("returns the org, the user and their role for a member", async () => {
    jar.set(ORG_COOKIE, ORG);
    expect(await requireOrgMember()).toEqual({ ok: true, orgId: ORG, userId: USER, role: "bookkeeper" });
  });

  it("accepts the legacy cookie name, and prefers the current one when both are set", async () => {
    jar.set(LEGACY_ORG_COOKIE, ORG);
    expect(await getMemberOrgId()).toBe(ORG);

    jar.set(ORG_COOKIE, OTHER_ORG);
    expect(await getMemberOrgId()).toBeNull();
    expect(lookups.at(-1)).toEqual({ organization_id: OTHER_ORG, user_id: USER });
  });

  it("fails closed when the membership lookup errors", async () => {
    jar.set(ORG_COOKIE, ORG);
    membershipError = { message: "connection reset" };
    const res = await requireOrgMember();
    expect(res).toMatchObject({ ok: false, reason: "lookup-failed", error: common("en")("orgAccess.lookupFailed") });
    expect(JSON.stringify(res)).not.toContain("connection reset");
  });

  it("fails closed when the auth check throws", async () => {
    jar.set(ORG_COOKIE, ORG);
    getUserThrows = true;
    expect(await requireOrgMember()).toMatchObject({ ok: false, reason: "lookup-failed" });
  });

  it("says why in the reader's language", async () => {
    jar.set(ORG_COOKIE, OTHER_ORG);
    for (const l of ["zh-Hans", "es"] as const) {
      locale = l;
      const res = await requireOrgMember();
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error).toBe(common(l)("orgAccess.notMember"));
      expect(res.error).not.toBe(common("en")("orgAccess.notMember"));
      expect(res.error).not.toContain("orgAccess.");
    }
  });

  it("never touches the service-role client", async () => {
    jar.set(ORG_COOKIE, ORG);
    await requireOrgMember();
    jar.set(ORG_COOKIE, OTHER_ORG);
    await requireOrgMember();
    expect(serviceClientsCreated).toBe(0);
  });
});

describe("requireMemberOf / getMemberOrgId / getMyRole", () => {
  it("getMemberOrgId is the org id for a member and null for anyone else", async () => {
    jar.set(ORG_COOKIE, ORG);
    expect(await getMemberOrgId()).toBe(ORG);
    user = null;
    expect(await getMemberOrgId()).toBeNull();
  });

  it("requireMemberOf refuses an org id other than the one the member is working in", async () => {
    jar.set(ORG_COOKIE, ORG);
    expect(await requireMemberOf(ORG)).toMatchObject({ ok: true, orgId: ORG });
    expect(await requireMemberOf(OTHER_ORG)).toMatchObject({ ok: false, reason: "not-member" });
  });

  it("getMyRole answers from the same single membership check", async () => {
    jar.set(ORG_COOKIE, ORG);
    expect(await getMyRole()).toBe("bookkeeper");
    expect(lookups).toHaveLength(1);
    jar.set(ORG_COOKIE, OTHER_ORG);
    expect(await getMyRole()).toBeNull();
  });
});

// ─── The actions from the bug report ────────────────────────────────────────

const templates = await import("@/lib/actions/project-templates");
const timeEntries = await import("@/lib/actions/time-entries");

describe("a forged org cookie no longer reaches the service-role client", () => {
  beforeEach(() => {
    jar.set(ORG_COOKIE, OTHER_ORG); // signed in, but not a member of OTHER_ORG
  });

  it("createProjectTemplate refuses", async () => {
    const res = await templates.createProjectTemplate({ name: "x" });
    expect(res.ok).toBe(false);
    expect(serviceClientsCreated).toBe(0);
  });

  it("updateProjectTemplate refuses", async () => {
    const res = await templates.updateProjectTemplate("tpl-1", { name: "x" });
    expect(res.ok).toBe(false);
    expect(serviceClientsCreated).toBe(0);
  });

  it("deleteProjectTemplate refuses", async () => {
    const res = await templates.deleteProjectTemplate("tpl-1");
    expect(res.ok).toBe(false);
    expect(serviceClientsCreated).toBe(0);
  });

  it("importTimeEntriesToInvoice refuses", async () => {
    await expect(timeEntries.importTimeEntriesToInvoice("inv-1", ["te-1"])).rejects.toThrow();
    expect(serviceClientsCreated).toBe(0);
  });

  it("an unauthenticated caller is refused too", async () => {
    user = null;
    const res = await templates.deleteProjectTemplate("tpl-1");
    expect(res.ok).toBe(false);
    expect(serviceClientsCreated).toBe(0);
  });

  it("a member still gets through, scoped to their own org", async () => {
    jar.set(ORG_COOKIE, ORG);
    const res = await templates.createProjectTemplate({ name: "Kitchen remodel" });
    expect(res).toEqual({ ok: true, templateId: "tpl-1" });
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0]).toMatchObject({ table: "project_templates", op: "insert" });

    await templates.deleteProjectTemplate("tpl-1");
    expect(serviceCalls.at(-1)).toMatchObject({
      table: "project_templates",
      op: "delete",
      filters: [["id", "tpl-1"], ["organization_id", ORG]],
    });
  });
});

/**
 * The dial itself: which levels a teammate is offered, which one is in force,
 * and what happens when the write is refused.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  autonomyOf,
  defaultAutonomy,
  dialOwners,
  displayLevel,
  levelsFor,
  setStoredAutonomy,
  storedAutonomy,
} from "../autonomy";
import { ALL_ACTIONS } from "../registry";
import { fakeDb, type FakeDb } from "./fake-db";
import { ORG } from "./context";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = (f: FakeDb) => f as unknown as SupabaseClient;

/** An `ai_employees` row as `rowToEmployee` expects to read it. */
function employeeRow(over: Record<string, unknown> = {}) {
  return {
    id: "emp-sarah",
    organization_id: ORG,
    slug: "sarah",
    name: "Sarah",
    role: "AI Sales Development Rep",
    department: "Revenue",
    dna_module: "revenue",
    industry_pack: null,
    goals: [],
    knowledge_sources: [],
    permissions: {},
    model: "claude-sonnet-4-6",
    personality: "Persistent",
    status: "active",
    config: {},
    ...over,
  };
}

describe("which levels a teammate is offered", () => {
  const owners = dialOwners(ALL_ACTIONS);

  it("gives everyone who can reach a customer the full set", () => {
    expect(levelsFor("sarah", owners)).toEqual(["suggest", "act_with_approval", "autonomous"]);
    expect(levelsFor("alex", owners)).toEqual(["suggest", "act_with_approval", "autonomous"]);
  });

  it("never offers Emma 'suggest only' — she cannot put a caller on hold", () => {
    expect(levelsFor("emma", owners)).toEqual(["act_with_approval", "autonomous"]);
  });

  it("offers internal-only work two levels: hold back, or go ahead", () => {
    // Nothing Mark does himself leaves the business, so "do it once I approve"
    // would be a level with nothing to approve.
    expect(levelsFor("mark", { internal: new Set(["mark"]), outbound: new Set() })).toEqual([
      "suggest",
      "autonomous",
    ]);
  });

  it("gives a teammate who only reads no dial at all", () => {
    expect(levelsFor("tim", owners)).toEqual([]);
    expect(levelsFor("nobody", owners)).toEqual([]);
  });
});

describe("the level in force", () => {
  it("is what the row holds", () => {
    expect(autonomyOf({ permissions: { autonomy: "suggest" } }, "emma")).toBe("suggest");
  });

  it("falls back to the roster when the row says nothing — never to free rein", () => {
    expect(autonomyOf({ permissions: {} }, "sarah")).toBe("act_with_approval");
    expect(autonomyOf(null, "emma")).toBe(defaultAutonomy("emma"));
    expect(defaultAutonomy("tim")).toBe("suggest");
  });

  it("ignores a value that is not a level", () => {
    expect(autonomyOf({ permissions: { autonomy: "whatever" } }, "sarah")).toBe("act_with_approval");
  });

  it("shows a level the teammate is not offered as the one it behaves like", () => {
    // Mark ships on act_with_approval and is offered two levels. For work that
    // never leaves the business, "ask me first" IS "go ahead" — so that is what
    // the dial shows, rather than nothing at all.
    const internalOnly = levelsFor("mark", { internal: new Set(["mark"]), outbound: new Set() });
    expect(displayLevel("act_with_approval", internalOnly)).toBe("autonomous");
    expect(displayLevel("suggest", internalOnly)).toBe("suggest");
    // Nothing offered matches: an unselected dial beats one showing a level the
    // row does not hold.
    expect(displayLevel("suggest", ["act_with_approval", "autonomous"])).toBeNull();
  });

  it("reads the stored row, and survives a database that will not answer", async () => {
    const withRow = fakeDb({ ai_employees: [employeeRow({ permissions: { autonomy: "autonomous" } })] });
    await expect(storedAutonomy(db(withRow), ORG, "sarah")).resolves.toBe("autonomous");

    const broken = fakeDb({ ai_employees: [employeeRow()] });
    broken.failNext("ai_employees", "select", "connection refused");
    await expect(storedAutonomy(db(broken), ORG, "sarah")).resolves.toBe("act_with_approval");
  });
});

describe("saving the dial", () => {
  it("merges into permissions and leaves the rest of them alone", async () => {
    const f = fakeDb({
      ai_employees: [employeeRow({ permissions: { autonomy: "suggest", scopes: ["revenue.pipeline"] } })],
    });
    const out = await setStoredAutonomy(db(f), ORG, "sarah", "autonomous");
    expect(out).toEqual({ ok: true, level: "autonomous", activated: false });
    expect(f.tables.ai_employees[0].permissions).toEqual({
      autonomy: "autonomous",
      scopes: ["revenue.pipeline"],
    });
    expect(f.tables.ai_employees[0].status).toBe("active");
  });

  it("switches on a teammate the seeder left in draft — saying how they work is starting them", async () => {
    const f = fakeDb({ ai_employees: [employeeRow({ status: "draft" })] });
    const out = await setStoredAutonomy(db(f), ORG, "sarah", "act_with_approval");
    expect(out).toEqual({ ok: true, level: "act_with_approval", activated: true });
    expect(f.tables.ai_employees[0].status).toBe("active");
  });

  it("says so when there is no such teammate in this business", async () => {
    const f = fakeDb({ ai_employees: [] });
    await expect(setStoredAutonomy(db(f), ORG, "sarah", "suggest")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("calls a write that changed no row refused, not saved", async () => {
    // What an RLS refusal looks like through the caller's client: no error at
    // all, and nothing updated.
    const f = fakeDb({ ai_employees: [employeeRow()] });
    const original = f.from.bind(f);
    f.from = ((table: string) => {
      const q = original(table);
      // An update whose WHERE matches nothing, exactly as the policy would.
      const update = q.update.bind(q);
      q.update = (patch: Record<string, unknown>) => update(patch).eq("id", "someone-else");
      return q;
    }) as FakeDb["from"];

    await expect(setStoredAutonomy(db(f), ORG, "sarah", "autonomous")).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
    expect(f.tables.ai_employees[0].permissions).toEqual({});
  });

  it("says so when the write errors", async () => {
    const f = fakeDb({ ai_employees: [employeeRow()] });
    f.failNext("ai_employees", "update", "deadlock detected");
    await expect(setStoredAutonomy(db(f), ORG, "sarah", "autonomous")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

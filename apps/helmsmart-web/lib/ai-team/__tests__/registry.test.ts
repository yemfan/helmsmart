/**
 * The registry, the card and the bundles agree: every outbound action is one
 * the approval card knows, every tool the model sees has a schema and an
 * owner, and every owner-facing key the AI team's lib files use exists in all
 * three languages (the i18n guards skip files that bind no namespace).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));

import { AI_TEAM_ACTIONS, getAction, toolsForModel } from "../registry";
import { ACTION_KEYS, APPROVABLE_ACTIONS, EDITABLE_ACTIONS } from "../approval-view";
import { teamFaces } from "../faces";
import { loadNamespace, resolvesIn } from "@/lib/i18n/__tests__/bundles";

describe("the AI team's registry", () => {
  it("has one action per key, and only keys the card knows", () => {
    const keys = AI_TEAM_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.values(ACTION_KEYS).sort());
  });

  it("marks exactly the outbound actions as approvable, and only those with edits as editable", () => {
    const outbound = AI_TEAM_ACTIONS.filter((a) => a.riskClass === "outbound").map((a) => a.key);
    expect([...APPROVABLE_ACTIONS].sort()).toEqual(outbound.sort());
    for (const key of EDITABLE_ACTIONS) {
      expect(APPROVABLE_ACTIONS.has(key)).toBe(true);
      expect(getAction(key)?.applyEdits).toBeTypeOf("function");
    }
    for (const a of AI_TEAM_ACTIONS.filter((x) => x.riskClass === "outbound")) {
      expect(a.preview, `${a.key} must preview`).toBeTypeOf("function");
    }
  });

  it("routes each action to the specialist whose domain it is", () => {
    const owner = Object.fromEntries(AI_TEAM_ACTIONS.map((a) => [a.key, a.employee]));
    expect(owner).toMatchObject({
      send_invoice_reminder: "alex",
      text_client: "sarah",
      create_task: "mark",
      hand_off_to_owner: "mark",
      list_recent_calls: "emma",
      list_overdue_invoices: "alex",
      find_clients: "sarah",
    });
  });

  it("gives the model a schema and an owner for every tool", () => {
    const team = teamFaces([{ slug: "alex", name: "Alexandra", role: "AI Finance Director", avatar: null }]);
    const tools = toolsForModel(AI_TEAM_ACTIONS, team);
    for (const t of tools) {
      expect(t.input_schema).toMatchObject({ type: "object" });
      expect(t.description).toMatch(/\[Owned by .+\.\]$/);
    }
    // The business's own name for the employee.
    expect(tools.find((t) => t.name === "send_invoice_reminder")?.description).toContain("[Owned by Alexandra, AI Finance Director.]");
    for (const t of tools.filter((x) => APPROVABLE_ACTIONS.has(x.name))) {
      expect(t.description).toMatch(/never sends by itself/);
    }
  });
});

const ROOT = join(__dirname, "..", "..", "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "evals") sources(p, out);
    } else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("owner-facing copy in lib/ai-team", () => {
  const files = [...sources(join(ROOT, "lib", "ai-team")), join(ROOT, "lib", "actions", "approvals.ts")];
  const keys = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:\.home|\bt)\(\s*"((?:aiApprovals|ask)\.[\w.]+)"/g)) keys.add(m[1]);
  }

  it("finds the keys it is meant to check", () => {
    expect(keys.size).toBeGreaterThan(10);
  });

  it.each(["en", "es", "zh-Hans"])("resolves every one in %s", (locale) => {
    const bundle = loadNamespace(locale, "home");
    const missing = [...keys].filter((k) => !resolvesIn(bundle, k));
    expect(missing).toEqual([]);
  });
});

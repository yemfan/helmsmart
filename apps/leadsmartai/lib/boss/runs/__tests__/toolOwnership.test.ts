import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/closeboss/autopilot", () => ({ effectiveAutopilot: vi.fn(async () => false) }));
vi.mock("@/lib/closeboss/activities", () => ({ logAssistantActivity: vi.fn(async () => undefined) }));

import { bossToolsForModel } from "../engine";
import { listBossTools } from "../../tools/registry";
import { ASSIGNEE_PERSONA } from "@/lib/closeboss/assigneePersona";

/**
 * Max narrates who he is putting on a mission, and the UI stamps the same
 * step with the tool's `assignee`. Those two came from different places once:
 * the badge from the registry, the sentence from whatever the model guessed.
 * Asked to set up an open house he wrote "I'll have the Transaction team set
 * up the full open house playbook" directly above a step reading
 * "Ruby · Marketing Assistant".
 *
 * The owner now travels in the tool description the model reads. These tests
 * hold that wiring in place.
 */
describe("tool ownership reaches the model", () => {
  const forModel = bossToolsForModel();
  const byName = new Map(forModel.map((t) => [t.name, t]));

  it("names an owner on every tool that has an assignee", () => {
    const missing = listBossTools()
      .filter((t) => ASSIGNEE_PERSONA[t.assignee])
      .filter((t) => !/\[Owned by .+, the .+ team\.\]$/.test(byName.get(t.name)?.description ?? ""))
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("gives the open house to Ruby and Marketing, not Transaction", () => {
    const desc = byName.get("setup_open_house")?.description ?? "";
    expect(desc).toContain("[Owned by Ruby, the Marketing team.]");
    expect(desc).not.toContain("Transaction");
  });

  it("names the owner the registry assigns, for every tool", () => {
    for (const tool of listBossTools()) {
      const persona = ASSIGNEE_PERSONA[tool.assignee];
      if (!persona) continue;
      expect(byName.get(tool.name)?.description).toContain(
        `[Owned by ${persona.name}, the ${persona.team} team.]`,
      );
    }
  });

  it("keeps the original description text intact", () => {
    for (const tool of listBossTools()) {
      expect(byName.get(tool.name)?.description).toContain(tool.description);
    }
  });
});

/**
 * hand_off_to_agent is the one tool whose owner is decided at runtime: the
 * escalation is the same, but a wire to escrow belongs to the Transaction team
 * and a billing question to the Receptionist. It used to be stamped
 * "Emma · Receptionist" either way, so a deal question came back looking like
 * the team had misread it.
 */
describe("hand_off_to_agent routes by domain", () => {
  const handoff = listBossTools().find((t) => t.name === "hand_off_to_agent");

  /**
   * The `owner` field, through zod's PUBLIC surface.
   *
   * This used to walk `_def.innerType._def.values` — zod 3's private shape.
   * zod 4 moved those under `_zod.def`, and in a git worktree `zod` resolves
   * to the root-hoisted 4.x rather than the ^3.24.2 this app declares, so the
   * chain yielded undefined. `?? []` then turned "I could not reach the enum"
   * into "the enum is empty", and the failure read as a roster bug: red in
   * every local run, green in CI, dismissed as unrelated on six PRs. #1553.
   *
   * `.unwrap()` and `.options` are public in both majors, so this no longer
   * cares which resolves — and it THROWS rather than defaulting, because a
   * check that cannot reach its subject must say so instead of reporting an
   * empty one.
   */
  type OwnerField = {
    description?: string;
    unwrap?: () => { options?: readonly string[] };
  };
  const ownerField = (): OwnerField => {
    const schema = handoff?.inputSchema as unknown as
      | { shape?: Record<string, OwnerField> }
      | undefined;
    const field = schema?.shape?.owner;
    if (!field) throw new Error("hand_off_to_agent has no `owner` on its inputSchema");
    return field;
  };
  const ownerOptions = (): string[] => {
    const field = ownerField();
    if (typeof field.unwrap !== "function") {
      throw new Error("`owner` is not an optional-wrapped enum; zod's shape may have moved (#1553)");
    }
    const options = field.unwrap().options;
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error("could not read the `owner` enum from zod; its shape may have moved (#1553)");
    }
    return [...options];
  };

  it("offers an owner covering every teammate on the roster", () => {
    const options = ownerOptions();
    expect(options.sort()).toEqual(
      ["accountant", "marketing_assistant", "receptionist", "sales_assistant", "transaction_assistant"].sort(),
    );
    for (const o of options) expect(ASSIGNEE_PERSONA[o]).toBeTruthy();
  });

  it("tells the model to pick by domain, naming the escrow case", () => {
    const desc = ownerField().description ?? "";
    expect(desc).toContain("transaction_assistant");
    expect(desc).toContain("escrow");
  });
});

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
 * "Ruby · Marketing Specialist".
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

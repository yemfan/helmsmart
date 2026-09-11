/**
 * Mark's face on Ask Mark resolves the way the Command Center board resolves
 * it — the business's choice, else the roster default — and a failed read can
 * never take down the dashboard layout that asks for it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEmployee = vi.hoisted(() => vi.fn());
vi.mock("@helm/ai-workforce", () => ({
  getEmployee,
  getBlueprint: (slug: string) => (slug === "mark" ? { slug: "mark", avatar: "persona-13" } : undefined),
}));
vi.mock("@helm/ui", () => ({ defaultAvatarForSeed: () => "persona-hash" }));

import { markAvatarId, markDefaultAvatar } from "@/lib/mark-avatar";

const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("markAvatarId", () => {
  it("uses the avatar the business picked for Mark", async () => {
    getEmployee.mockResolvedValue({ id: "emp-mark", avatar: "persona-07" });
    expect(await markAvatarId(db, "org-1")).toBe("persona-07");
    expect(getEmployee).toHaveBeenCalledWith(db, "org-1", "mark");
  });

  it("falls back to Mark's roster default when none was picked", async () => {
    getEmployee.mockResolvedValue({ id: "emp-mark", avatar: null });
    expect(await markAvatarId(db, "org-1")).toBe("persona-13");
  });

  it("falls back to the roster default for an unseeded workforce", async () => {
    getEmployee.mockResolvedValue(null);
    expect(await markAvatarId(db, "org-1")).toBe("persona-13");
  });

  it("never throws — a failed read is the roster default", async () => {
    getEmployee.mockRejectedValue(new Error("timeout"));
    await expect(markAvatarId(db, "org-1")).resolves.toBe("persona-13");
  });

  it("doesn't query without an org", async () => {
    expect(await markAvatarId(db, "")).toBe(markDefaultAvatar());
    expect(getEmployee).not.toHaveBeenCalled();
  });
});

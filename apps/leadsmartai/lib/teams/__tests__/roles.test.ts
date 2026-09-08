import { describe, expect, it } from "vitest";
import { canAdministerTeam, canManageTeam, isAssignableRole } from "../roles";

describe("team roles", () => {
  it("lets owners and managers run onboarding, and only owners administer", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("manager")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
    expect(canAdministerTeam("owner")).toBe(true);
    expect(canAdministerTeam("manager")).toBe(false);
  });
  it("never lets ownership be assigned through the role control", () => {
    expect(isAssignableRole("manager")).toBe(true);
    expect(isAssignableRole("member")).toBe(true);
    expect(isAssignableRole("owner")).toBe(false);
    expect(isAssignableRole("admin")).toBe(false);
  });
});

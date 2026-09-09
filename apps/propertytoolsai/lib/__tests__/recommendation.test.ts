import { describe, expect, it } from "vitest";

import { getNextBestActions } from "../recommendation";
import { buildUserProfile } from "../userProfile";

/**
 * The home-value report's "Suggested Next Steps" rendered a list of plain
 * strings as inert <div>s, fed by `recommendations.actions` — which the
 * estimate route returns as `[]` and nothing else ever fills. So the section
 * never appeared at all, and would have been unclickable if it had.
 *
 * The report now renders components/NextSteps, which reads these. Two
 * properties it depends on, neither previously asserted.
 */
describe("getNextBestActions", () => {
  const profileFrom = (events: Parameters<typeof buildUserProfile>[0]) =>
    getNextBestActions(buildUserProfile(events));

  it("never returns nothing, even for a visitor it knows nothing about", () => {
    // If this can be empty, the section silently disappears again — which is
    // the bug being fixed, reintroduced one layer down.
    expect(profileFrom([]).length).toBeGreaterThan(0);
  });

  it("gives every action somewhere real to go", () => {
    for (const action of profileFrom([])) {
      expect(action.href, action.title).toMatch(/^\//);
      expect(action.title.trim().length, action.id).toBeGreaterThan(0);
    }
  });

  it("returns no duplicate destinations", () => {
    const actions = profileFrom([]);
    expect(new Set(actions.map((a) => a.href)).size).toBe(actions.length);
  });
});
